use serde_json::json;
fn main() {
    let actor = |n: u64| { let mut id = [0_u8; 32]; id[..8].copy_from_slice(&n.to_le_bytes()); format!("0x{}", hex::encode(id)) };
    let wasm = format!("0x{}", hex::encode(wat::parse_str(include_str!("../fixtures/counter.wat")).unwrap()));
    let send = |label: &str, payload: &str| json!({"kind":"send", "label":label, "program":actor(1), "sender":actor(100001), "payload":payload, "value":"0", "gasLimit":"200000000000", "blocks":1});
    println!("{}", serde_json::to_string_pretty(&json!({
        "version":1, "name":"Counter: state, blocks, and an expected failure",
        "accounts":[{"id":actor(100001), "balance":"1000000000000000000"}],
        "programs":[{"id":actor(1), "name":"Counter", "balance":"10000000000000", "wasm":wasm, "mock":null, "idl":null}],
        "steps":[
            send("Initialize the counter", "0x"), send("Increment once", "0x01"),
            {"kind":"expectReply", "label":"Counter is 1", "message":1, "payload":"0x01000000"},
            {"kind":"advance", "label":"Advance three blocks", "blocks":3},
            send("Increment again", "0x01"),
            {"kind":"expectReply", "label":"State persisted: counter is 2", "message":4, "payload":"0x02000000"},
            send("Trigger a WASM trap", "0xff"),
            {"kind":"expectStatus", "label":"Failure was observed", "message":6, "status":"failed"},
            send("Read after the failure", "0x00"),
            {"kind":"expectReply", "label":"Counter still equals 2", "message":8, "payload":"0x02000000"}
        ]
    })).unwrap());
}
