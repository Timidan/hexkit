// cargo run --example idl  →  writes tally.idl next to Cargo.toml
fn main() {
    sails_rs::generate_idl_to_file::<sails_tally::TallyProgram>(concat!(env!("CARGO_MANIFEST_DIR"), "/tally.idl")).unwrap();
}
