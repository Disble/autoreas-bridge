import { describe, expect, it } from 'vitest';
import { toJDConfigFormValues, toJDConfigInput } from '../jdconfig-panel.helpers';
import type { JDStatus } from '../../../../../shared/contracts/download.types';

const status: JDStatus = {
  email: 'user@example.com',
  hasPassword: true,
  deviceName: 'desktop-1',
  exePathOverride: 'C:/jd/jd.exe',
  defaultDestDir: 'D:/downloads',
  lastSeenStatus: 'online',
  lastSeenAtMs: 1_700_000_000_000,
};

describe('toJDConfigFormValues', () => {
  it('maps every non-secret field from JDStatus', () => {
    const form = toJDConfigFormValues(status);

    expect(form.email).toBe('user@example.com');
    expect(form.deviceName).toBe('desktop-1');
    expect(form.exePathOverride).toBe('C:/jd/jd.exe');
    expect(form.defaultDestDir).toBe('D:/downloads');
  });

  it('NEVER pre-fills plaintextPassword, even when hasPassword is true', () => {
    const form = toJDConfigFormValues(status);

    expect(form.plaintextPassword).toBe('');
  });
});

describe('toJDConfigInput', () => {
  it('omits plaintextPassword from the write request when the field is left blank', () => {
    const input = toJDConfigInput({
      email: 'user@example.com',
      plaintextPassword: '',
      deviceName: 'desktop-1',
      exePathOverride: '',
      defaultDestDir: '',
    });

    expect(input.plaintextPassword).toBeUndefined();
  });

  it('includes plaintextPassword in the write request when the user typed a new one', () => {
    const input = toJDConfigInput({
      email: 'user@example.com',
      plaintextPassword: 'new-secret',
      deviceName: 'desktop-1',
      exePathOverride: '',
      defaultDestDir: '',
    });

    expect(input.plaintextPassword).toBe('new-secret');
  });
});
