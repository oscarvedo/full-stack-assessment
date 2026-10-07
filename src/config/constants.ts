import BigNumber from 'bignumber.js';

export const APP_CONSTANTS = {
  // Exchange rate 1 XAUT-SBX = 2500 USDT-SBX
  XAUT_PRICE_USDT: new BigNumber('2500.00000000'),

  // Comission
  COMMISSION_RATE: new BigNumber('0.01'),

  // Quote validity TTL
  QUOTE_TTL_SECONDS: 30,

  // Decimal precision
  DECIMAL_PLACES: 8,

  // Compliance Risk Thresholds (in USDT-SBX)
  COMPLIANCE_THRESHOLDS: {
    LOW_MAX: new BigNumber('1000.00000000'),
    MEDIUM_MAX: new BigNumber('5000.00000000')
  }
};
