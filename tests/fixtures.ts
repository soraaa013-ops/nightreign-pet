import type { Preset } from '../src/contracts/types'

export function preset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 'test-expedition',
    name: '测试渡夜',
    mode: 'original',
    battleSeconds: [180, 240, 300],
    classroomSeconds: 2400,
    customSeconds: [270, 180, 210, 180, 180, 270, 180, 210, 180, 240, 300],
    ...overrides,
  }
}

export function shortPreset(overrides: Partial<Preset> = {}): Preset {
  return preset({ mode: 'custom', customSeconds: Array<number>(11).fill(1), ...overrides })
}
