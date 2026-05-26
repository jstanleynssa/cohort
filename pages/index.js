import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { useState, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/router'

const STONEBRIDGE_ORG_ID = '9b736a98-f0d3-4930-b377-83b9e30bb9e0'
const TRAINING_URL = 'https://www.nssapros.com/login'
const NSSA = { medium: '#1C80BC', dark: '#13405E' }
const IRMAA = { medium: '#DE5B63', dark: '#AF2A35' }

const supabase = createBrowserSupabaseClient()

export async function getServerSideProps(context) {
  const supabaseServer = createServerSupabaseClient(context)
  const { data: { session } } = await supabaseServer.auth.getSession()

  if (!session) {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const { data: profile } = await supabaseServer
    .from('user_profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  const isAdmin = profile?.is_admin === true

  // Fetch all partners for admin org filter
  let allPartners = []
  if (isAdmin) {
    const { data: partners } = await supabaseServer
      .from('partners')
      .select('id, name, contact_name')
      .order('name')
    allPartners = partners || []
  }

  const orgId = isAdmin ? null : profile?.org_id

  // For non-admin, get their org partner info
  let partnerData = null
  if (!isAdmin && orgId) {
    const { data } = await supabaseServer
      .from('partners')
      .select('name, contact_name')
      .eq('id', orgId)
      .single()
    partnerData = data
  }

  // For non-admin: fetch their org's progress
  // For admin: fetch all progress (filtered client-side by org dropdown)
  let progressQuery = supabaseServer.from('advisor_progress').select('*').order('email')
  if (!isAdmin && orgId) {
    progressQuery = progressQuery.eq('org_id', orgId)
  }

  const { data: progressData, error: progressError } = await progressQuery

  if (progressError) {
    console.error('Error:', progressError)
    return {
      props: {
        advisors: [],
        orgName: isAdmin ? 'Admin' : (partnerData?.name || ''),
        supervisorName: partnerData?.contact_name || '',
        isAdmin,
        allPartners,
        userEmail: session.user.email
      }
    }
  }

  // Build advisor map including org_id for admin filtering
  const advisorMap = {}
  progressData.forEach(p => {
    if (!advisorMap[p.email]) {
      const fullName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null
      advisorMap[p.email] = {
        name: fullName,
        email: p.email,
        org_id: p.org_id,
        nssa: null,
        irmaa: null
      }
    }
    if (p.course === 'NSSA') advisorMap[p.email].nssa = p
    if (p.course === 'IRMAA' || p.course === 'IRMAACP') advisorMap[p.email].irmaa = p
  })

  return {
    props: {
      advisors: Object.values(advisorMap),
      orgName: isAdmin ? 'Admin' : (partnerData?.name || 'Dashboard'),
      supervisorName: partnerData?.contact_name || '',
      isAdmin,
      allPartners,
      userEmail: session.user.email
    }
  }
}

function buildNudgeMailto(advisor, course, supervisorName) {
  const courseData = course === 'NSSA' ? advisor.nssa : advisor.irmaa
  const firstName = advisor.name ? advisor.name.split(' ')[0] : advisor.email
  const progress = courseData?.pct_complete ?? 0
  const courseName = course === 'NSSA' ? 'NSSA® Social Security' : 'IRMAACP™ Medicare & IRMAA'
  const progressText = progress === 0
    ? `you have not yet started the ${courseName} course`
    : `you are currently ${progress}% through the ${courseName} course`
  const subject = encodeURIComponent(`Your ${courseName} Training`)
  const body = encodeURIComponent(
    `Hi ${firstName},\n\n` +
    `${supervisorName ? supervisorName + ' wanted to reach out' : 'We wanted to check in'} regarding your ${courseName} training. We noticed that ${progressText}.\n\n` +
    `We would love to see you make some progress — the certification will be a valuable addition to your practice and help you better serve your clients.\n\n` +
    `Click here to continue your training:\n${TRAINING_URL}\n\n` +
    `Please don't hesitate to reach out if you have any questions or need support.\n\n` +
    `Best regards,\n${supervisorName || 'Your Training Coordinator'}`
  )
  return `mailto:${advisor.email}?subject=${subject}&body=${body}`
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
  return <span style={{ color: '#dc2626' }}>Not purchased</span>
}

function CertBadge({ certified }) {
  if (certified) return <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ Certified</span>
  return <span style={{ color: '#999' }}>—</span>
}

// Nudge should only show when there is actionable incompleteness:
// - Course not started or in progress (not 100%)
// - Course complete but exam not purchased
// - Exam purchased but not passed
// Never shows when certified
function shouldShowNudge(courseData) {
  if (!courseData) return false
  if (courseData.certified) return false
  if (courseData.exam_passed) return false
  if (courseData.pct_complete === 100) return false  // course complete — no nudge needed
  return true
}

function NudgeButton({ advisor, course, supervisorName }) {
  const courseData = course === 'NSSA' ? advisor.nssa : advisor.irmaa
  if (!shouldShowNudge(courseData)) return null
  const href = buildNudgeMailto(advisor, course, supervisorName)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-block',
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        background: '#f3f4f6',
        color: '#374151',
        textDecoration: 'none',
        border: '1px solid #e5e7eb',
        marginTop: '4px',
        cursor: 'pointer'
      }}
    >
      ✉ Nudge
    </a>
  )
}

function CourseColumns({ course, advisor, courseName, supervisorName }) {
  if (!course) return (
    <>
      <td style={td}><span style={{ color: '#999' }}>Not enrolled</span></td>
      <td style={td}><span style={{ color: '#999' }}>—</span></td>
      <td style={td}><span style={{ color: '#999' }}>—</span></td>
    </>
  )
  return (
    <>
      <td style={td}>
        <ProgressBadge pct={course.pct_complete} />
        <div>
          <NudgeButton advisor={advisor} course={courseName} supervisorName={supervisorName} />
        </div>
      </td>
      <td style={td}><ExamBadge purchased={course.exam_purchased} passed={course.exam_passed} /></td>
      <td style={td}><CertBadge certified={course.certified} /></td>
    </>
  )
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 4, fontSize: 11 }}>↕</span>
  return <span style={{ marginLeft: 4, fontSize: 11 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
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
const selectStyle = { fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white' }

function thStyle(bg) {
  return {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 500,
    color: 'white',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    background: bg
  }
}

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

function getSortValue(advisor, col) {
  switch (col) {
    case 'name': return advisor.name || advisor.email
    case 'nssa-progress': return advisor.nssa?.pct_complete ?? -1
    case 'nssa-exam': return advisor.nssa?.exam_passed ? 2 : advisor.nssa?.exam_purchased ? 1 : 0
    case 'nssa-cert': return advisor.nssa?.certified ? 1 : 0
    case 'irmaa-progress': return advisor.irmaa?.pct_complete ?? -1
    case 'irmaa-exam': return advisor.irmaa?.exam_passed ? 2 : advisor.irmaa?.exam_purchased ? 1 : 0
    case 'irmaa-cert': return advisor.irmaa?.certified ? 1 : 0
    default: return ''
  }
}

function StatusKey() {
  const items = [
    { color: '#16a34a', label: 'Complete / Passed / Certified', description: 'Student has fully completed this stage' },
    { color: '#2563eb', label: 'In Progress / Purchased', description: 'Course partially complete, or exam purchased but not yet taken' },
    { color: '#dc2626', label: 'Not Started / Not Purchased', description: 'No activity recorded for this stage' },
    { color: '#999', label: '—', description: 'Not enrolled in this course' },
  ]
  return (
    <div style={{ marginTop: '1.5rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem 1.25rem' }}>
      <p style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status Key</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {items.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: item.color, fontWeight: 600, fontSize: '13px', minWidth: 16 }}>{item.color === '#999' ? '—' : '●'}</span>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 500, color: item.color }}>{item.label}</span>
              <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '6px' }}>— {item.description}</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '1px 6px', color: '#374151' }}>✉ Nudge</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>— Click to email this student and encourage progress</span>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ advisors, orgName, supervisorName, isAdmin, allPartners, userEmail }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [orgFilter, setOrgFilter] = useState('all')
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // For admin: filter advisors by selected org
  const orgFilteredAdvisors = useMemo(() => {
    if (!isAdmin || orgFilter === 'all') return advisors
    return advisors.filter(a => a.org_id === orgFilter)
  }, [advisors, isAdmin, orgFilter])

  // Derive org name for header
  const displayOrgName = useMemo(() => {
    if (!isAdmin) return orgName
    if (orgFilter === 'all') return 'Admin'
    const partner = allPartners.find(p => p.id === orgFilter)
    return partner ? partner.name : 'Admin'
  }, [isAdmin, orgFilter, allPartners, orgName])

  // Derive supervisor name for nudge emails (admin viewing a specific org)
  const activeSupervisorName = useMemo(() => {
    if (!isAdmin) return supervisorName
    if (orgFilter === 'all') return ''
    const partner = allPartners.find(p => p.id === orgFilter)
    return partner?.contact_name || ''
  }, [isAdmin, orgFilter, allPartners, supervisorName])

  const nssaEnrolled = orgFilteredAdvisors.filter(a => a.nssa).length
  const irmaaEnrolled = orgFilteredAdvisors.filter(a => a.irmaa).length
  const nssaCertified = orgFilteredAdvisors.filter(a => a.nssa?.certified).length
  const irmaaCertified = orgFilteredAdvisors.filter(a => a.irmaa?.certified).length
  const nssaComplete = orgFilteredAdvisors.filter(a => a.nssa?.pct_complete === 100).length
  const irmaaComplete = orgFilteredAdvisors.filter(a => a.irmaa?.pct_complete === 100).length
  const needsExam = orgFilteredAdvisors.filter(a =>
    (a.nssa?.pct_complete === 100 && !a.nssa?.exam_purchased) ||
    (a.irmaa?.pct_complete === 100 && !a.irmaa?.exam_purchased)
  ).length

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const filtered = useMemo(() => {
    let list = [...orgFilteredAdvisors]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        (a.name && a.name.toLowerCase().includes(q)) ||
        a.email.toLowerCase().includes(q)
      )
    }
    if (courseFilter === 'nssa') list = list.filter(a => a.nssa)
    if (courseFilter === 'irmaa') list = list.filter(a => a.irmaa)
    list = list.filter(a => matchesStatus(a, statusFilter, courseFilter))
    list.sort((a, b) => {
      const av = getSortValue(a, sortCol)
      const bv = getSortValue(b, sortCol)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [orgFilteredAdvisors, search, courseFilter, statusFilter, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  function handlePageSize(val) {
    setPageSize(Number(val))
    setPage(1)
  }

  const cols = [
    { key: 'name', label: 'Student', bg: '#1a1a1a', width: '22%' },
    { key: 'nssa-progress', label: 'NSSA Progress', bg: NSSA.dark },
    { key: 'nssa-exam', label: 'NSSA Exam', bg: NSSA.dark },
    { key: 'nssa-cert', label: 'NSSA Cert', bg: NSSA.dark },
    { key: 'irmaa-progress', label: 'IRMAACP Progress', bg: IRMAA.dark },
    { key: 'irmaa-exam', label: 'IRMAACP Exam', bg: IRMAA.dark },
    { key: 'irmaa-cert', label: 'IRMAACP Cert', bg: IRMAA.dark },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: '1300px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>
            {displayOrgName} Training Dashboard
          </h1>
          <p style={{ color: '#666', fontSize: '14px' }}>{orgFilteredAdvisors.length} students enrolled</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
          <img src="/nssa-irmaa-logos.png" alt="NSSA and IRMAACP logos" style={{ height: '50px', width: 'auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>{userEmail}</span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                fontSize: '12px',
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: 'white',
                color: '#374151',
                cursor: loggingOut ? 'not-allowed' : 'pointer',
                opacity: loggingOut ? 0.6 : 1
              }}
            >
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>

      {/* Admin org filter */}
      {isAdmin && (
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Viewing organization:</label>
          <select
            style={{ ...selectStyle, minWidth: '240px' }}
            value={orgFilter}
            onChange={e => { setOrgFilter(e.target.value); setPage(1) }}
          >
            <option value="all">All organizations</option>
            {allPartners.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
        {[
          { label: 'Enrolled', value: orgFilteredAdvisors.length, sub: null, color: '#555' },
          { label: 'NSSA Certified', value: nssaCertified, sub: pct(nssaCertified, nssaEnrolled) + ' of NSSA enrolled', color: NSSA.medium, barVal: nssaCertified, barTotal: nssaEnrolled },
          { label: 'IRMAACP Certified', value: irmaaCertified, sub: pct(irmaaCertified, irmaaEnrolled) + ' of IRMAACP enrolled', color: IRMAA.medium, barVal: irmaaCertified, barTotal: irmaaEnrolled },
          { label: 'NSSA Complete', value: nssaComplete, sub: pct(nssaComplete, nssaEnrolled) + ' of NSSA enrolled', color: NSSA.medium, barVal: nssaComplete, barTotal: nssaEnrolled },
          { label: 'IRMAACP Complete', value: irmaaComplete, sub: pct(irmaaComplete, irmaaEnrolled) + ' of IRMAACP enrolled', color: IRMAA.medium, barVal: irmaaComplete, barTotal: irmaaEnrolled },
          { label: 'Needs Exam', value: needsExam, sub: pct(needsExam, orgFilteredAdvisors.length) + ' of cohort', color: '#6b7280', barVal: needsExam, barTotal: orgFilteredAdvisors.length }
        ].map(stat => (
          <div key={stat.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{stat.label}</p>
            <p style={{ fontSize: '22px', fontWeight: 600 }}>{stat.value}</p>
            {stat.sub && <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{stat.sub}</p>}
            {stat.barTotal ? <MetricBar value={stat.barVal} total={stat.barTotal} color={stat.color} /> : null}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', minWidth: '220px' }}
        />
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
          {filtered.length} student{filtered.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th
                  key={col.key}
                  style={{ ...thStyle(col.bg), width: col.width }}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((advisor, i) => (
              <tr key={advisor.email} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                <td style={{ ...td }}>
                  <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>{advisor.name || advisor.email}</p>
                  {advisor.name && <p style={{ fontSize: '12px', color: '#666' }}>{advisor.email}</p>}
                </td>
                <CourseColumns course={advisor.nssa} advisor={advisor} courseName="NSSA" supervisorName={activeSupervisorName} />
                <CourseColumns course={advisor.irmaa} advisor={advisor} courseName="IRMAACP" supervisorName={activeSupervisorName} />
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                  No students match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>Previous</button>
              <span style={{ fontSize: '13px', color: '#666' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Status key */}
      <StatusKey />

    </div>
  )
}