const IS_TEST = process.env.NODE_ENV === 'test';

module.exports = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'tontine_nataal_secret_2024',
  IS_TEST,
};
