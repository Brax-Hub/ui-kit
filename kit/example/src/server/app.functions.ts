// What the shell needs: who the member is, as the memberships row says, and the manifest's name.
import { createServerFn } from '@tanstack/react-start'
import { loadManifest } from './mcp/manifest'
import { requireMember } from './middleware/rbs'

export const getShellFn = createServerFn({ method: 'GET' })
  .middleware([requireMember()])
  // input: none
  .handler(async ({ context }) => {
    const manifest = loadManifest()
    return {
      app: { name: manifest.name, slug: manifest.slug, version: manifest.version },
      member: { id: context.memberId, hubMemberId: context.hubMemberId, name: context.name, role: context.role, hubRole: context.hubRole },
    }
  })
