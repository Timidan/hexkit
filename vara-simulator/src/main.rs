use std::io::{self, Read};

fn main() {
    let result = (|| {
        let mut input = String::new();
        io::stdin().take(48 * 1024 * 1024 + 1).read_to_string(&mut input).map_err(|e| e.to_string())?;
        if input.len() > 48 * 1024 * 1024 { return Err("Scenario exceeds 48 MiB".into()); }
        hexkit_vara_simulator::run_json(&input)
    })();
    match result {
        Ok(report) => println!("{}", serde_json::to_string(&report).unwrap()),
        Err(error) => {
            println!("{}", serde_json::json!({"error": error}));
            std::process::exit(1);
        }
    }
}
