import { describe, expect, it } from 'vitest'
import { faviconCandidates } from './favicon'

describe('faviconCandidates', () => {
  it('按常见路径顺序生成同源图标地址', () => {
    expect(faviconCandidates(' https://example.com/course?id=1#top ')).toEqual([
      'https://example.com/favicon.ico',
      'https://example.com/apple-touch-icon.png',
      'https://example.com/apple-touch-icon-precomposed.png',
      'https://example.com/favicon.png',
      'https://example.com/favicon.svg',
    ])
  })

  it('保留非默认端口', () => {
    expect(faviconCandidates('http://localhost:8080/app')[0]).toBe('http://localhost:8080/favicon.ico')
  })

  it('拒绝非网页协议、凭证和不完整地址', () => {
    for (const value of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.com/', 'not a url']) {
      expect(faviconCandidates(value)).toEqual([])
    }
  })
})
