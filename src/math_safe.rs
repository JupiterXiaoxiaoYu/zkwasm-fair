use crate::error::*;

/// 安全的乘法运算，检查溢出
pub fn safe_mul(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_mul(b).ok_or(ERROR_OVERFLOW)
}

/// 安全的除法运算，检查除零
pub fn safe_div(a: u64, b: u64) -> Result<u64, u32> {
    if b == 0 {
        return Err(ERROR_DIVISION_BY_ZERO);
    }
    Ok(a / b)
}

/// 安全的减法运算，检查下溢
pub fn safe_sub(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_sub(b).ok_or(ERROR_UNDERFLOW)
}

/// 安全的加法运算，检查溢出
pub fn safe_add(a: u64, b: u64) -> Result<u64, u32> {
    a.checked_add(b).ok_or(ERROR_OVERFLOW)
}

 