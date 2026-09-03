import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/env.js';

const ORIGINAL_ENV = process.env;

function withEnv(env: NodeJS.ProcessEnv, fn: () => void): void {
  process.env = { ...env };
  try {
    fn();
  } finally {
    process.env = ORIGINAL_ENV;
  }
}

test('loadConfig defaults to legacy service_account and highlevel api 2.3', () => {
  withEnv(
    {
      GLPI_URL: 'https://glpi.example.local',
      GLPI_USER_TOKEN: 'user-token',
      GLPI_APP_TOKEN: 'app-token',
    },
    () => {
      const config = loadConfig();
      assert.equal(config.apiMode, 'legacy');
      assert.equal(config.authMode, 'service_account');
      assert.equal(config.apiVersion, '2.3');
      assert.equal(config.legacy.userToken, 'user-token');
    }
  );
});

test('loadConfig accepts highlevel without legacy credentials', () => {
  withEnv(
    {
      GLPI_URL: 'https://glpi.example.local',
      GLPI_API_MODE: 'highlevel',
    },
    () => {
      const config = loadConfig();
      assert.equal(config.apiMode, 'highlevel');
    }
  );
});

test('loadConfig rejects unknown api mode', () => {
  withEnv(
    {
      GLPI_URL: 'https://glpi.example.local',
      GLPI_API_MODE: 'v2',
      GLPI_USER_TOKEN: 'user-token',
    },
    () => {
      assert.throws(() => loadConfig(), /GLPI_API_MODE must be one of/);
    }
  );
});

test('legacy service_account requires a legacy authentication method', () => {
  withEnv(
    {
      GLPI_URL: 'https://glpi.example.local',
      GLPI_API_MODE: 'legacy',
    },
    () => {
      assert.throws(() => loadConfig(), /Legacy service_account auth requires/);
    }
  );
});

test('loadConfig only accepts credential-free HTTP(S) GLPI URLs', () => {
  for (const GLPI_URL of ['file:///etc/passwd', 'https://user:secret@glpi.example.local', 'https://glpi.example.local/#fragment']) {
    withEnv({ GLPI_URL, GLPI_API_MODE: 'highlevel' }, () => {
      assert.throws(() => loadConfig(), /GLPI_URL is not a valid URL/);
    });
  }
});

test('loadConfig strictly validates API version and numeric HTTP settings', () => {
  withEnv({ GLPI_URL: 'https://glpi.example.local', GLPI_API_MODE: 'highlevel', GLPI_API_VERSION: 'latest' }, () => {
    assert.throws(() => loadConfig(), /MAJOR\.MINOR/);
  });
  withEnv({ GLPI_URL: 'https://glpi.example.local', GLPI_API_MODE: 'highlevel', GLPI_TIMEOUT_MS: '0' }, () => {
    assert.throws(() => loadConfig(), /GLPI_TIMEOUT_MS/);
  });
  withEnv({ GLPI_URL: 'https://glpi.example.local', GLPI_API_MODE: 'highlevel', GLPI_MAX_RETRIES: '2oops' }, () => {
    assert.throws(() => loadConfig(), /GLPI_MAX_RETRIES/);
  });
});
