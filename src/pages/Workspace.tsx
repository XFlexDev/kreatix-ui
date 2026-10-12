import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { Submission } from '../../server/schema'
import { useResource } from '../api'
import { useSession } from '../session'
import { AuthGate, DateLabel, Empty, ErrorNotice, Loading, PageHeading } from '../components/UI'

export function Workspace() { return <AuthGate><WorkList/></AuthGate> }
function WorkList() {
  const { user } = useSession()
  const { data, loading, error, reload } = useResource<{ items: Submission[] }>('/me/submissions')
  return <><PageHeading title="Your work" action={<Link className="button primary" to="/publish">Publish</Link>}/><nav className="workspace-nav"><Link to={`/creators/${user?.username}`}>Profile</Link><Link to="/settings">Settings</Link>{user?.role === 'admin' && <Link to="/moderation">Review queue</Link>}</nav>{loading ? <Loading/> : error ? <ErrorNotice message={error} retry={reload}/> : data?.items.length ? <div className="work-list">{data.items.map(item => <motion.article layout key={item.id} className="work-list-row"><div><h2><Link to={`/publish/${item.id}`}>{item.title}</Link></h2><p>{item.reason || `${item.kind} · ${item.framework}`}</p></div><span className={`work-status status-${item.status}`}>{item.status === 'approved' ? 'Published' : item.status === 'rejected' ? 'Changes requested' : item.status === 'pending' ? 'In review' : 'Draft'}</span><DateLabel value={item.updatedAt}/><Link className="button secondary" to={`/publish/${item.id}`}>Edit</Link><Link className="text-link" to={`/work/${item.slug}`}>View</Link></motion.article>)}</div> : <Empty title="No work yet" action={<Link className="button secondary" to="/publish">Create a draft</Link>}>Share a component or an open-source library.</Empty>}</>
}
