import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.ts'

/** Signed-in user + sign out. Renders nothing when login is disabled. */
export function Account() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity })
  if (!data?.auth_enabled || !data.user) return null

  async function signOut() {
    await api.logout()
    qc.clear()
    window.location.replace('/')
  }

  return (
    <div className="account">
      {data.user.avatar_url && <img src={data.user.avatar_url} alt="" width={20} height={20} />}
      <span>{data.user.name}</span>
      <button className="link" onClick={signOut}>Sign out</button>
    </div>
  )
}
