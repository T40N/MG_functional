module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@users/(.*)$': '<rootDir>/src/users/$1',
    '^@categories/(.*)$': '<rootDir>/src/categories/$1',
    '^@products/(.*)$': '<rootDir>/src/products/$1',
    '^@cart/(.*)$': '<rootDir>/src/cart/$1',
  },
};
