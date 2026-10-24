use gtest::{BlockRunResult, Program, System, WasmProgram};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scenario {
    pub version: u8,
    pub name: String,
    pub accounts: Vec<Account>,
    pub programs: Vec<ProgramInput>,
    pub steps: Vec<Step>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Account { pub id: String, pub balance: String }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProgramInput {
    pub id: String,
    pub name: String,
    pub balance: String,
    pub wasm: Option<String>,
    pub mock: Option<MockInput>,
    pub idl: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MockInput { pub reply: String, pub fail: bool }

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Step {
    Send { label: String, program: String, sender: String, payload: String, value: String, #[serde(rename = "gasLimit")] gas_limit: String, blocks: u32 },
    Advance { label: String, blocks: u32 },
    ExpectReply { label: String, message: usize, payload: String },
    ExpectStatus { label: String, message: usize, status: String },
    ExpectBalance { label: String, account: String, equals: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub runtime: &'static str,
    pub name: String,
    pub block: u32,
    pub assertions: usize,
    pub passed: Option<bool>,
    pub steps: Vec<StepResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub index: usize,
    pub label: String,
    pub block: u32,
    pub message_id: Option<String>,
    pub status: String,
    pub gas_burned: String,
    pub logs: Vec<MessageLog>,
    pub balances: Vec<BalanceChange>,
    pub detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageLog {
    pub block: u32,
    pub id: String,
    pub source: String,
    pub destination: String,
    pub payload: String,
    pub reply_to: Option<String>,
    pub reply_code: Option<String>,
    pub success: Option<bool>,
}

#[derive(Serialize)]
pub struct BalanceChange { pub id: String, pub before: String, pub after: String }

#[derive(Debug, Clone)]
struct Dependency { reply: Vec<u8>, fail: bool }
impl WasmProgram for Dependency {
    fn init(&mut self, _: Vec<u8>) -> Result<Option<Vec<u8>>, &'static str> { Ok(None) }
    fn handle(&mut self, _: Vec<u8>) -> Result<Option<Vec<u8>>, &'static str> {
        if self.fail { Err("Injected dependency failure") } else { Ok(Some(self.reply.clone())) }
    }
    fn state(&mut self) -> Result<Vec<u8>, &'static str> { Ok(vec![]) }
    fn clone_boxed(&self) -> Box<dyn WasmProgram> { Box::new(self.clone()) }
}

fn bytes(value: &str, max: usize) -> Result<Vec<u8>, String> {
    let raw = value.strip_prefix("0x").ok_or("Bytes must start with 0x")?;
    if raw.len() > max * 2 { return Err(format!("Byte input exceeds {max} bytes")); }
    hex::decode(raw).map_err(|_| "Invalid hex bytes".into())
}
fn id(value: &str) -> Result<[u8; 32], String> {
    bytes(value, 32)?.try_into().map_err(|_| "Actor ids must contain 32 bytes".into())
}
fn number(value: &str) -> Result<u128, String> {
    if value.is_empty() || !value.bytes().all(|c| c.is_ascii_digit()) { return Err("Amounts must be unsigned decimal integers".into()); }
    value.parse().map_err(|_| "Amount exceeds u128".into())
}
fn as_hex(value: impl AsRef<[u8]>) -> String { format!("0x{}", hex::encode(value)) }

pub fn run_json(input: &str) -> Result<Report, String> {
    let scenario: Scenario = serde_json::from_str(input).map_err(|e| format!("Invalid scenario: {e}"))?;
    // gtest reports malformed modules and invalid runtime operations as panics.
    // The bridge runs each request in its own process, including lazy-page state.
    std::panic::catch_unwind(|| run(scenario)).map_err(|e| {
        e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or("Gear runtime failed".into())
    })?
}

fn run(s: Scenario) -> Result<Report, String> {
    if s.version != 1 || s.name.len() > 120 || s.programs.is_empty() || s.programs.len() > 8 || s.accounts.is_empty() || s.accounts.len() > 32 || s.steps.is_empty() || s.steps.len() > 128 {
        return Err("Use version 1, 1–8 programs, 1–32 accounts, and 1–128 steps".into());
    }
    let mut actor_ids = BTreeSet::new();
    for a in &s.accounts {
        let actor = id(&a.id)?;
        if actor == [0; 32] || !actor_ids.insert(actor) { return Err("Account and program ids must be unique and nonzero".into()); }
        number(&a.balance)?;
    }
    for p in &s.programs {
        let actor = id(&p.id)?;
        if actor == [0; 32] || !actor_ids.insert(actor) { return Err("Account and program ids must be unique and nonzero".into()); }
        if p.name.len() > 120 || p.wasm.is_some() == p.mock.is_some() { return Err("Each program needs either WASM or an explicit mock".into()); }
        if p.idl.as_ref().is_some_and(|idl| idl.len() > 2 * 1024 * 1024) { return Err("IDL exceeds 2 MiB".into()); }
        number(&p.balance)?;
        if let Some(wasm) = &p.wasm {
            if !bytes(wasm, 4 * 1024 * 1024)?.starts_with(b"\0asm\x01\0\0\0") { return Err("Invalid WebAssembly module header".into()); }
        }
        if let Some(mock) = &p.mock { bytes(&mock.reply, 64 * 1024)?; }
    }
    let mut total_blocks = 0_u32;
    for (i, step) in s.steps.iter().enumerate() {
        let label = match step { Step::Send { label, .. } | Step::Advance { label, .. } | Step::ExpectReply { label, .. } | Step::ExpectStatus { label, .. } | Step::ExpectBalance { label, .. } => label };
        if label.len() > 120 { return Err("Step label exceeds 120 bytes".into()); }
        match step {
            Step::Send { program, sender, payload, value, gas_limit, blocks, .. } => {
                if !s.programs.iter().any(|p| p.id.eq_ignore_ascii_case(program)) || !s.accounts.iter().any(|a| a.id.eq_ignore_ascii_case(sender)) { return Err(format!("Step {} must use a configured program and sender", i + 1)); }
                bytes(payload, 64 * 1024)?; number(value)?;
                let gas = number(gas_limit)?;
                if gas == 0 || gas > gtest::constants::MAX_USER_GAS_LIMIT as u128 { return Err(format!("Gas limit must be between 1 and {}", gtest::constants::MAX_USER_GAS_LIMIT)); }
                total_blocks = total_blocks.checked_add(*blocks).ok_or("Too many blocks")?;
            }
            Step::Advance { blocks, .. } => { total_blocks = total_blocks.checked_add(*blocks).ok_or("Too many blocks")?; }
            Step::ExpectReply { message, payload, .. } => {
                if *message >= i || !matches!(s.steps.get(*message), Some(Step::Send { .. })) { return Err("Reply assertion must reference an earlier send step".into()); }
                bytes(payload, 64 * 1024)?;
            }
            Step::ExpectStatus { message, status, .. } => {
                if *message >= i || !matches!(s.steps.get(*message), Some(Step::Send { .. })) || !["success", "failed"].contains(&status.as_str()) { return Err("Status assertion must reference an earlier send and use success or failed".into()); }
            }
            Step::ExpectBalance { account, equals, .. } => { if !actor_ids.contains(&id(account)?) { return Err("Balance assertion must use a configured actor".into()); } number(equals)?; }
        }
    }
    if total_blocks > 256 { return Err("A scenario may advance at most 256 blocks".into()); }

    let sys = System::new();
    for a in &s.accounts { sys.mint_to(id(&a.id)?, number(&a.balance)?); }
    for p in &s.programs {
        if number(&p.balance)? > 0 { sys.mint_to(id(&p.id)?, number(&p.balance)?); }
        if let Some(wasm) = &p.wasm { Program::from_binary_with_id(&sys, id(&p.id)?, bytes(wasm, 4 * 1024 * 1024)?); }
        if let Some(mock) = &p.mock { Program::mock_with_id(&sys, id(&p.id)?, Dependency { reply: bytes(&mock.reply, 64 * 1024)?, fail: mock.fail }); }
    }
    let mut blocks: Vec<BlockRunResult> = vec![];
    let mut messages = BTreeMap::new();
    let mut results = vec![];
    let mut assertions = 0;
    let mut passed = true;
    for (index, step) in s.steps.iter().enumerate() {
        let before: BTreeMap<_, _> = actor_ids.iter().map(|a| (*a, sys.balance_of(*a))).collect();
        let start = blocks.len();
        let (label, message_id, status, detail) = match step {
            Step::Send { label, program, sender, payload, value, gas_limit, blocks: count } => {
                let program = sys.get_program(id(program)?).ok_or("Program is unavailable")?;
                let msg = program.send_bytes_with_gas(id(sender)?, bytes(payload, 64 * 1024)?, number(gas_limit)? as u64, number(value)?);
                messages.insert(index, msg);
                for _ in 0..*count { blocks.push(sys.run_next_block()); }
                let status = if blocks[start..].iter().any(|b| b.failed.contains(&msg)) { "failed" }
                    else if blocks[start..].iter().any(|b| b.succeed.contains(&msg)) { "processed" }
                    else if blocks[start..].iter().any(|b| b.not_executed.contains(&msg)) { "notExecuted" } else { "queued" };
                (label, Some(as_hex(msg)), status, None)
            }
            Step::Advance { label, blocks: count } => {
                for _ in 0..*count { blocks.push(sys.run_next_block()); }
                (label, None, "advanced", None)
            }
            Step::ExpectReply { label, message, payload } => {
                assertions += 1;
                let msg = messages.get(message).ok_or("Missing referenced message")?;
                let expected = bytes(payload, 64 * 1024)?;
                let found = blocks.iter().flat_map(|b| b.log()).any(|l| l.reply_to() == Some(*msg) && l.reply_code().is_some_and(|c| c.is_success()) && l.payload() == expected);
                passed &= found;
                (label, Some(as_hex(msg)), if found { "passed" } else { "assertionFailed" }, Some(format!("Successful reply to step {} must equal {payload}", message + 1)))
            }
            Step::ExpectStatus { label, message, status } => {
                assertions += 1;
                let msg = messages.get(message).ok_or("Missing referenced message")?;
                let failed = blocks.iter().any(|b| b.failed.contains(msg));
                let found = if status == "failed" { failed } else { !failed && blocks.iter().any(|b| b.succeed.contains(msg)) };
                passed &= found;
                (label, Some(as_hex(msg)), if found { "passed" } else { "assertionFailed" }, Some(format!("Processing status for step {} must be {status}", message + 1)))
            }
            Step::ExpectBalance { label, account, equals } => {
                assertions += 1;
                let balance = sys.balance_of(id(account)?);
                let found = balance == number(equals)?;
                passed &= found;
                (label, None, if found { "passed" } else { "assertionFailed" }, Some(format!("Balance {balance}; expected {equals}")))
            }
        };
        let logs = blocks[start..].iter().flat_map(|b| b.log().iter().map(|l| MessageLog {
            block: b.block_info.height, id: as_hex(l.id()), source: as_hex(l.source()), destination: as_hex(l.destination()), payload: as_hex(l.payload()),
            reply_to: l.reply_to().map(as_hex), reply_code: l.reply_code().map(|c| format!("{c:?}")), success: l.reply_code().map(|c| c.is_success()),
        })).collect();
        let gas: u128 = blocks[start..].iter().flat_map(|b| b.gas_burned.values()).map(|g| *g as u128).sum();
        results.push(StepResult { index, label: label.clone(), block: sys.block_height(), message_id, status: status.into(), detail, gas_burned: gas.to_string(), logs,
            balances: actor_ids.iter().map(|a| BalanceChange { id: as_hex(a), before: before[a].to_string(), after: sys.balance_of(*a).to_string() }).collect(),
        });
    }
    Ok(Report { runtime: "gtest 2.0.0", name: s.name, block: sys.block_height(), assertions, passed: (assertions > 0).then_some(passed), steps: results })
}

#[cfg(test)]
mod tests {
    use super::run_json;
    #[test]
    fn state_and_assertions_are_executed_in_gear() {
        let fixture = include_str!("../../public/vara/scenario.json");
        let report = run_json(fixture).unwrap();
        assert_eq!(report.passed, Some(true));
        assert_eq!(report.assertions, 4);
        assert!(report.steps.iter().any(|s| s.status == "failed"));
        let wrong_expectation = fixture.replacen("0x02000000", "0x03000000", 1);
        assert_eq!(run_json(&wrong_expectation).unwrap().passed, Some(false));
        let asynchronous = include_str!("../../public/vara/async-scenario.json");
        assert_eq!(run_json(asynchronous).unwrap().passed, Some(true));
        let mut failed_dependency: serde_json::Value = serde_json::from_str(asynchronous).unwrap();
        failed_dependency["programs"][1]["wasm"] = serde_json::Value::Null;
        failed_dependency["programs"][1]["mock"] = serde_json::json!({"reply":"0x", "fail":true});
        failed_dependency["steps"].as_array_mut().unwrap().truncate(5);
        failed_dependency["steps"][4] = serde_json::json!({"kind":"expectStatus", "label":"Dependency failure reaches caller", "message":2, "status":"failed"});
        assert_eq!(run_json(&failed_dependency.to_string()).unwrap().passed, Some(true));
    }
}
