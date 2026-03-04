// Mock environment variables before any test runs
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

// Setup fetch mock
import fetchMock from 'jest-fetch-mock';
fetchMock.enableMocks();
