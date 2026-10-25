use serde_json::json;
fn main() {
    let actor = |n: u64| { let mut id = [0_u8; 32]; id[..8].copy_from_slice(&n.to_le_bytes()); format!("0x{}", hex::encode(id)) };
    let wasm = |text: &str| format!("0x{}", hex::encode(wat::parse_str(text).unwrap()));
    let send = |label: &str, program: u64, sender: u64, payload: &str| json!({"kind":"send", "label":label, "program":actor(program), "sender":actor(sender), "payload":payload, "value":"0", "gasLimit":"200000000000", "blocks":1});
    println!("{}", serde_json::to_string_pretty(&json!({
        "version":1, "name":"Two programs: delayed call, wait, wake, and reply",
        "accounts":[{"id":actor(100001), "balance":"1000000000000000000"}, {"id":actor(100002), "balance":"1000000000000000000"}],
        "programs":[
            {"id":actor(1), "name":"Async forwarder", "balance":"10000000000000", "wasm":wasm(include_str!("../fixtures/forwarder.wat")), "mock":null, "idl":null},
            {"id":actor(2), "name":"Counter dependency", "balance":"10000000000000", "wasm":wasm(include_str!("../fixtures/counter.wat")), "mock":null, "idl":null}
        ],
        "steps":[send("Initialize dependency",2,100001,"0x"), send("Initialize forwarder",1,100001,"0x"), send("Call dependency from a second account",1,100002,"0x01"),
            {"kind":"advance", "label":"Deliver delayed message and wake caller", "blocks":4},
            {"kind":"expectReply", "label":"Forwarded counter result is 1", "message":2, "payload":"0x01000000"},
            send("Read the dependency state directly",2,100001,"0x00"),
            {"kind":"expectReply", "label":"Dependency state persisted", "message":5, "payload":"0x01000000"}
        ]
    })).unwrap());
}
