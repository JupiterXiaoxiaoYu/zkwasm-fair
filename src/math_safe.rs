use crate::error::*;

/// Safe multiplication operation, checks for overflow
pub fn safe_mul(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_mul(b).ok_or(ERROR_OVERFLOW)
}

/// Safe division operation, checks for division by zero
pub fn safe_div(a: u64, b: u64) -> Result<u64, u32> {
    if b == 0 {
        return Err(ERROR_DIVISION_BY_ZERO);
    }
    Ok(a / b)
}

/// Safe subtraction operation, checks for underflow
pub fn safe_sub(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_sub(b).ok_or(ERROR_UNDERFLOW)
}

/// Safe addition operation, checks for overflow
pub fn safe_add(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_add(b).ok_or(ERROR_OVERFLOW)
}

 