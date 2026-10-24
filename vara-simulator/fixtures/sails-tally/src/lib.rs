#![no_std]

use sails_rs::prelude::*;

static mut TOTAL: u32 = 0;

pub struct TallyService(());

#[service]
impl TallyService {
    /// Adds `amount` and returns the new total.
    #[export]
    pub fn add(&mut self, amount: u32) -> u32 {
        unsafe {
            TOTAL = TOTAL.saturating_add(amount);
            TOTAL
        }
    }

    #[export]
    pub fn total(&self) -> u32 {
        unsafe { TOTAL }
    }
}

pub struct TallyProgram(());

#[program]
impl TallyProgram {
    pub fn new() -> Self {
        Self(())
    }

    pub fn tally(&self) -> TallyService {
        TallyService(())
    }
}
