import { createClient } from '@supabase/supabase-js'
import { useState, useMemo } from 'react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const STONEBRIDGE_ORG_ID = '9b736a98-f0d3-4930-b377-83b9e30bb9e0'

export async function getServerSideProps() {
  const { data: progressData, error: progressError } = await supabase
    .from('advisor_progress')
    .select('*')
    .eq('org_id', STONEBRIDGE_ORG_ID)
    .order('email')

  if (progressError) {
    console.error('Error:', progressError)
    return { props: { advisors: [] } }
  }

  const advisorMap = {}
  progressData.forEach(p => {
    if (!advisorMap[p.email]) {
      const fullName = p.first_name && p.last_name
        ? `${p.first_name} ${p.last_name}`
        : null
      advisorMap[p.email] = { name: fullName, email: p.email, nssa: null, irmaa: null }
    }
    if (p.course === 'NSSA') advisorMap[p.email].nssa = p
    if (p.course === 'IRMAA' || p.course === 'IRMAACP') advisorMap[p.email].irmaa = p
  })

  return { props: { advisors: Object.values(advisorMap) } }
}

function pct(num, den) {
  if (!den) return '0%'
  return Math.round((num / den) * 100) + '%'
}

function ProgressBadge({ pct: p }) {
  if (p === null || p === undefined) return <span style={{ color: '#999' }}>—</span>
  if (p === 100) return <span style={{ color: '#16a34a', fontWeight: 500 }}>Complete</span>
  if (p > 0) return <span style={{ color: '#2563eb' }}>{p}% complete</span>
  return <span style={{ color: '#dc2626' }}>Not started</span>
}

function ExamBadge({ purchased, passed }) {
  if (passed) return <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ Passed</span>
  if (purchased) return <span style={{ color: '#2563eb' }}>Purchased</span>
  return <span style={{ color: '#d97706' }}>Not purchased</span>
}

function CertBadge({ certified }) {
  if (certified) return <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ Certified</span>
  return <span style={{ color: '#999' }}>—</span>
}

function CourseColumns({ course }) {
  if (!course) return (
    <>
      <td style={td}><span style={{ color: '#999' }}>Not enrolled</span></td>
      <td style={td}><span style={{ color: '#999' }}>—</span></td>
      <td style={td}><span style={{ color: '#999' }}>—</span></td>
    </>
  )
  return (
    <>
      <td style={td}><ProgressBadge pct={course.pct_complete} /></td>
      <td style={td}><ExamBadge purchased={course.exam_purchased} passed={course.exam_passed} /></td>
      <td style={td}><CertBadge certified={course.certified} /></td>
    </>
  )
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: '#ccc', marginLeft: 4 }}>↕</span>
  return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function MetricBar({ value, total, color }) {
  const width = total ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, width: '100%' }}>
        <div style={{ background: color, borderRadius: 4, height: 6, width: width + '%', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

const td = { padding: '12px 16px', fontSize: '13px' }
const th = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#666', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
const selectStyle = { fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white' }

function matchesStatus(advisor, statusFilter, courseFilter) {
  if (statusFilter === 'all') return true

  const courses = []
  if (courseFilter === 'all' || courseFilter === 'nssa') { if (advisor.nssa) courses.push(advisor.nssa) }
  if (courseFilter === 'all' || courseFilter === 'irmaa') { if (advisor.irmaa) courses.push(advisor.irmaa) }

  if (courses.length === 0) return false

  if (statusFilter === 'certified') return courses.some(c => c.certified)
  if (statusFilter === 'needs-exam') return courses.some(c => c.pct_complete === 100 && !c.exam_purchased)
  if (statusFilter === 'in-progress') return courses.some(c => c.pct_complete > 0 && c.pct_complete < 100)
  if (statusFilter === 'not-started') return courses.some(c => c.pct_complete === 0)
  return true
}

export default function Dashboard({ advisors }) {
  const [courseFilter, setCourseFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const nssaEnrolled = advisors.filter(a => a.nssa).length
  const irmaaEnrolled = advisors.filter(a => a.irmaa).length
  const nssaCertified = advisors.filter(a => a.nssa?.certified).length
  const irmaaCertified = advisors.filter(a => a.irmaa?.certified).length
  const nssaComplete = advisors.filter(a => a.nssa?.pct_complete === 100).length
  const irmaaComplete = advisors.filter(a => a.irmaa?.pct_complete === 100).length
  const needsExam = advisors.filter(a =>
    (a.nssa?.pct_complete === 100 && !a.nssa?.exam_purchased) ||
    (a.irmaa?.pct_complete === 100 && !a.irmaa?.exam_purchased)
  ).length

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const filtered = useMemo(() => {
    let list = [...advisors]

    if (courseFilter === 'nssa') list = list.filter(a => a.nssa)
    if (courseFilter === 'irmaa') list = list.filter(a => a.irmaa)
    list = list.filter(a => matchesStatus(a, statusFilter, courseFilter))

    list.sort((a, b) => {
      let av, bv
      if (sortCol === 'name') { av = a.name || a.email; bv = b.name || b.email }
      else if (sortCol === 'nssa') { av = a.nssa?.pct_complete ?? -1; bv = b.nssa?.pct_complete ?? -1 }
      else if (sortCol === 'irmaa') { av = a.irmaa?.pct_complete ?? -1; bv = b.irmaa?.pct_complete ?? -1 }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [advisors, courseFilter, statusFilter, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  function handlePageSize(val) {
    setPageSize(Number(val))
    setPage(1)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1300px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>Stonebridge Wealth</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>{advisors.length} advisors enrolled</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
        {[
          { label: 'Enrolled', value: advisors.length, sub: null, color: '#2563eb' },
          { label: 'NSSA Certified', value: nssaCertified, sub: pct(nssaCertified, nssaEnrolled) + ' of NSSA enrolled', color: '#16a34a', barVal: nssaCertified, barTotal: nssaEnrolled },
          { label: 'IRMAACP Certified', value: irmaaCertified, sub: pct(irmaaCertified, irmaaEnrolled) + ' of IRMAACP enrolled', color: '#16a34a', barVal: irmaaCertified, barTotal: irmaaEnrolled },
          { label: 'NSSA Complete', value: nssaComplete, sub: pct(nssaComplete, nssaEnrolled) + ' of NSSA enrolled', color: '#2563eb', barVal: nssaComplete, barTotal: nssaEnrolled },
          { label: 'IRMAACP Complete', value: irmaaComplete, sub: pct(irmaaComplete, irmaaEnrolled) + ' of IRMAACP enrolled', color: '#2563eb', barVal: irmaaComplete, barTotal: irmaaEnrolled },
          { label: 'Needs Exam', value: needsExam, sub: pct(needsExam, advisors.length) + ' of cohort', color: '#d97706', barVal: needsExam, barTotal: advisors.length }
        ].map(stat => (
          <div key={stat.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{stat.label}</p>
            <p style={{ fontSize: '22px', fontWeight: 600 }}>{stat.value}</p>
            {stat.sub && <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{stat.sub}</p>}
            {stat.barTotal && <MetricBar value={stat.barVal} total={stat.barTotal} color={stat.color} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selectStyle} value={courseFilter} onChange={e => { setCourseFilter(e.target.value); setPage(1) }}>
          <option value="all">All courses</option>
          <option value="nssa">NSSA only</option>
          <option value="irmaa">IRMAACP only</option>
        </select>
        <select style={selectStyle} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="all">All statuses</option>
          <option value="certified">Certified</option>
          <option value="needs-exam">Needs exam</option>
          <option value="in-progress">In progress</option>
          <option value="not-started">Not started</option>
        </select>
        <span style={{ fontSize: '13px', color: '#666', marginLeft: 'auto' }}>
          {filtered.length} advisor{filtered.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ ...th, width: '22%' }} onClick={() => handleSort('name')}>
                Advisor <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th style={{ ...th, background: '#f0f4ff' }} onClick={() => handleSort('nssa')}>
                NSSA Progress <SortIcon col="nssa" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th style={{ ...th, background: '#f0f4ff' }}>NSSA Exam</th>
              <th style={{ ...th, background: '#f0f4ff' }}>NSSA Cert</th>
              <th style={{ ...th, background: '#f0fff4' }} onClick={() => handleSort('irmaa')}>
                IRMAACP Progress <SortIcon col="irmaa" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th style={{ ...th, background: '#f0fff4' }}>IRMAACP Exam</th>
              <th style={{ ...th, background: '#f0fff4' }}>IRMAACP Cert</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((advisor, i) => (
              <tr key={advisor.email} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                <td style={{ ...td }}>
                  <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>{advisor.name || advisor.email}</p>
                  {advisor.name && <p style={{ fontSize: '12px', color: '#666' }}>{advisor.email}</p>}
                </td>
                <CourseColumns course={advisor.nssa} />
                <CourseColumns course={advisor.irmaa} />
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                  No advisors match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6', background: '#fafafa', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Show</span>
            <select style={{ ...selectStyle, padding: '4px 8px' }} value={pageSize} onChange={e => handlePageSize(e.target.value)}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={100}>100</option>
            </select>
            <span style={{ fontSize: '13px', color: '#666' }}>per page</span>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
                Previous
              </button>
              <span style={{ fontSize: '13px', color: '#666' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
