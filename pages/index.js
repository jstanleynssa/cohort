import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { useState, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/router'

const TRAINING_URL = 'https://www.nssapros.com/login'
const ENROLLMENT_EMAIL = 'engage@nssapros.com'
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

  let allPartners = []
  if (isAdmin) {
    const { data: partners } = await supabaseServer
      .from('partners')
      .select('id, name, contact_name')
      .order('name')
    allPartners = partners || []
  }

  const orgId = isAdmin ? null : profile?.org_id

  let partnerData = null
  if (!isAdmin && orgId) {
    const { data } = await supabaseServer
      .from('partners')
      .select('name, contact_name')
      .eq('id', orgId)
      .single()
    partnerData = data
  }

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

function getExamPurchaseUrl(advisor, course) {
  const hasNssa = advisor.nssa?.exam_purchased || advisor.nssa?.exam_passed
  const hasIrmaa = advisor.irmaa?.exam_purchased || advisor.irmaa?.exam_passed
  if (course === 'NSSA') {
    return hasIrmaa
      ? 'https://www.nssapros.com/offers/4YpLpE8j/checkout'
      : 'https://www.nssapros.com/offers/GJSX238b/checkout'
  }
  if (course === 'IRMAACP') {
    return hasNssa
      ? 'https://www.nssapros.com/offers/bqt32vof/checkout'
      : 'https://www.nssapros.com/offers/8sL5Vhk8/checkout'
  }
}

function buildExamPurchaseMailto(advisor, course, supervisorName) {
  const firstName = advisor.name ? advisor.name.split(' ')[0] : advisor.email
  const courseName = course === 'NSSA' ? 'NSSA® Social Security' : 'IRMAACP™ Medicare & IRMAA'
  const purchaseUrl = getExamPurchaseUrl(advisor, course)
  const subject = encodeURIComponent(`Your ${courseName} Certification Exam`)
  const body = encodeURIComponent(
    `Hi ${firstName},\n\n` +
    `Congratulations on completing the ${courseName} course! ` +
    `${supervisorName ? supervisorName + ' wanted to reach out' : 'We wanted to check in'} and encourage you to take the next step — purchasing and sitting for your certification exam.\n\n` +
    `You can purchase your exam here:\n${purchaseUrl}\n\n` +
    `The exam is the final step to earning your certification and it will be a valuable credential for your practice.\n\n` +
    `Please don't hesitate to reach out if you have any questions.\n\n` +
    `Best regards,\n${supervisorName || 'Your Training Coordinator'}`
  )
  return `mailto:${advisor.email}?subject=${subject}&body=${body}`
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

function buildEnrollmentMailto(advisor, course, supervisorName, orgName) {
  const courseName = course === 'NSSA' ? 'NSSA® Social Security' : 'IRMAACP™ Medicare & IRMAA'
  const studentName = advisor.name || advisor.email
  const subject = encodeURIComponent(`Enrollment Request: ${studentName} — ${courseName}`)
  const body = encodeURIComponent(
    `Hi NSSA Team,\n\n` +
    `${supervisorName ? supervisorName : 'I'} would like to request enrollment for the following student in the ${courseName} course:\n\n` +
    `Name: ${studentName}\n` +
    `Email: ${advisor.email}\n` +
    (orgName ? `Organization: ${orgName}\n` : '') +
    `\nPlease let us know if you need any additional information.\n\n` +
    `Best regards,\n${supervisorName || 'Training Coordinator'}`
  )
  return `mailto:${ENROLLMENT_EMAIL}?subject=${subject}&body=${body}`
}

function buildBatchEnrollmentMailto(selectedAdvisors, course, supervisorName, orgName) {
  const courseName = course === 'NSSA' ? 'NSSA® Social Security'
    : course === 'IRMAACP' ? 'IRMAACP™ Medicare & IRMAA'
    : 'NSSA® / IRMAACP™'
  const subject = encodeURIComponent(`Enrollment Request: ${selectedAdvisors.length} Student${selectedAdvisors.length !== 1 ? 's' : ''} — ${courseName}`)
  const studentList = selectedAdvisors.map(a => `  • ${a.name || a.email} (${a.email})`).join('\n')
  const body = encodeURIComponent(
    `Hi NSSA Team,\n\n` +
    `${supervisorName ? supervisorName : 'I'} would like to request enrollment for the following ${selectedAdvisors.length} student${selectedAdvisors.length !== 1 ? 's' : ''} in the ${courseName} course:\n\n` +
    studentList + '\n\n' +
    (orgName ? `Organization: ${orgName}\n\n` : '') +
    `Please let us know if you need any additional information.\n\n` +
    `Best regards,\n${supervisorName || 'Training Coordinator'}`
  )
  return `mailto:${ENROLLMENT_EMAIL}?subject=${subject}&body=${body}`
}

function pct(num, den) {
  if (!den) return '0%'
  return Math.round((num / den) * 100) + '%'
}

// Nudge: show when course is in progress (1-99%) or not started
function shouldShowNudge(courseData) {
  if (!courseData) return false
  if (courseData.certified) return false
  if (courseData.exam_passed) return false
  if (courseData.pct_complete === 100) return false
  return true
}

// Exam nudge: show when course complete but exam not yet purchased
function shouldShowExamNudge(courseData) {
  if (!courseData) return false
  if (courseData.exam_purchased || courseData.exam_passed || courseData.certified) return false
  return courseData.pct_complete === 100
}

// Enroll request: ONLY when not enrolled at all
function shouldShowEnrollRequest(courseData) {
  return !courseData
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

// Interactive status styles
const actionLink = (bg, color, border) => ({
  display: 'inline-block', fontSize: '13px', padding: '0', borderRadius: '4px',
  background: bg, color, textDecoration: 'none', border: `1px solid ${border}`,
  padding: '1px 7px', cursor: 'pointer', fontWeight: 400
})

function ProgressStatus({ course, advisor, courseName, supervisorName }) {
  if (!course) return <span style={{ color: '#999' }}>Not enrolled</span>
  const p = course.pct_complete
  if (p === 100) return <span style={{ color: '#16a34a', fontWeight: 500 }}>Complete</span>
  if (p > 0) {
    // In progress — nudge is actionable
    const href = buildNudgeMailto(advisor, courseName, supervisorName)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={actionLink('#f3f4f6', '#374151', '#e5e7eb')}>
        + {p}% complete
      </a>
    )
  }
  // Not started — nudge actionable
  const href = buildNudgeMailto(advisor, courseName, supervisorName)
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={actionLink('#fef2f2', '#dc2626', '#fecaca')}>
      + Not started
    </a>
  )
}

function ExamStatus({ course, advisor, courseName, supervisorName }) {
  if (!course) return <span style={{ color: '#999' }}>—</span>
  if (course.exam_passed) return <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ Passed</span>
  if (course.exam_purchased) return <span style={{ color: '#2563eb' }}>Purchased</span>
  // Not purchased — only actionable if course is complete
  if (course.pct_complete === 100) {
    const href = buildExamPurchaseMailto(advisor, courseName, supervisorName)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={actionLink('#fefce8', '#854d0e', '#fde68a')}>
        + Not purchased
      </a>
    )
  }
  return <span style={{ color: '#dc2626' }}>Not purchased</span>
}

function NotEnrolledStatus({ advisor, courseName, supervisorName, orgName }) {
  const href = buildEnrollmentMailto(advisor, courseName, supervisorName, orgName)
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={actionLink('#eff6ff', '#1d4ed8', '#bfdbfe')}>
      + Not enrolled
    </a>
  )
}

function CourseColumns({ course, advisor, courseName, supervisorName, orgName }) {
  if (!course) return (
    <>
      <td style={td}>
        <NotEnrolledStatus advisor={advisor} courseName={courseName} supervisorName={supervisorName} orgName={orgName} />
      </td>
      <td style={td}><span style={{ color: '#999' }}>—</span></td>
      <td style={td}><span style={{ color: '#999' }}>—</span></td>
    </>
  )
  return (
    <>
      <td style={td}>
        <ProgressStatus course={course} advisor={advisor} courseName={courseName} supervisorName={supervisorName} />
      </td>
      <td style={td}>
        <ExamStatus course={course} advisor={advisor} courseName={courseName} supervisorName={supervisorName} />
      </td>
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

const td = { padding: '12px 16px', fontSize: '13px', verticalAlign: 'top' }
const selectStyle = { fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white' }

function thStyle(bg) {
  return {
    padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500,
    color: 'white', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: bg
  }
}

function matchesStatus(advisor, statusFilter, courseFilter) {
  if (statusFilter === 'all') return true

  if (courseFilter === 'nssa' || courseFilter === 'irmaa') {
    const enrolled = courseFilter === 'nssa' ? !!advisor.nssa : !!advisor.irmaa
    const data = courseFilter === 'nssa' ? advisor.nssa : advisor.irmaa
    if (statusFilter === 'not-enrolled') return !enrolled
    if (!enrolled) return false
    if (statusFilter === 'certified') return data.certified
    if (statusFilter === 'not-certified') return !data.certified
    if (statusFilter === 'needs-exam') return data.pct_complete === 100 && !data.exam_purchased
    if (statusFilter === 'in-progress') return data.pct_complete > 0 && data.pct_complete < 100
    if (statusFilter === 'not-started') return data.pct_complete === 0
    return true
  }

  // All courses
  const courses = [advisor.nssa, advisor.irmaa].filter(Boolean)
  if (statusFilter === 'not-enrolled') return !advisor.nssa && !advisor.irmaa
  if (courses.length === 0) return false
  if (statusFilter === 'certified') return courses.some(c => c.certified)
  if (statusFilter === 'not-certified') return courses.some(c => !c.certified)
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
  return (
    <div style={{ marginTop: '1.5rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem 1.25rem' }}>
      <p style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status Key</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '13px' }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ fontWeight: 500, color: '#16a34a' }}>Complete / Passed / Certified</span> — Student has fully completed this stage</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '13px' }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ fontWeight: 500, color: '#2563eb' }}>In Progress / Purchased</span> — Course partially complete, or exam purchased but not yet taken</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#999', fontSize: '13px' }}>—</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Not enrolled in this course</span>
        </div>
        <div style={{ width: '100%', borderTop: '1px solid #f3f4f6', paddingTop: '10px', marginTop: '2px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actionable statuses — click to send email</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '1px 7px', color: '#dc2626' }}>+ Not started</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>— Emails student to encourage starting the course</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '1px 7px', color: '#374151' }}>+ 62.5% complete</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>— Emails student to encourage finishing the course</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 7px', color: '#854d0e' }}>+ Not purchased</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>— Emails student with link to purchase their exam (shown when course is complete)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 7px', color: '#1d4ed8' }}>+ Not enrolled</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>— Emails NSSA to request enrollment for this student</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 7px', color: '#15803d' }}>⬆ Request Enrollment (X selected)</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>— Batch email NSSA to enroll multiple selected students</span>
            </div>
          </div>
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
  const [selectedEmails, setSelectedEmails] = useState(new Set())

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const orgFilteredAdvisors = useMemo(() => {
    if (!isAdmin || orgFilter === 'all') return advisors
    return advisors.filter(a => a.org_id === orgFilter)
  }, [advisors, isAdmin, orgFilter])

  const displayOrgName = useMemo(() => {
    if (!isAdmin) return orgName
    if (orgFilter === 'all') return 'Admin'
    const partner = allPartners.find(p => p.id === orgFilter)
    return partner ? partner.name : 'Admin'
  }, [isAdmin, orgFilter, allPartners, orgName])

  const activeSupervisorName = useMemo(() => {
    if (!isAdmin) return supervisorName
    if (orgFilter === 'all') return ''
    const partner = allPartners.find(p => p.id === orgFilter)
    return partner?.contact_name || ''
  }, [isAdmin, orgFilter, allPartners, supervisorName])

  const activeOrgName = useMemo(() => {
    if (!isAdmin) return orgName
    if (orgFilter === 'all') return ''
    const partner = allPartners.find(p => p.id === orgFilter)
    return partner?.name || ''
  }, [isAdmin, orgFilter, allPartners, orgName])

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
    if (courseFilter === 'nssa' && statusFilter !== 'not-enrolled') list = list.filter(a => a.nssa)
    if (courseFilter === 'irmaa' && statusFilter !== 'not-enrolled') list = list.filter(a => a.irmaa)
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

  const allPageSelected = paginated.length > 0 && paginated.every(a => selectedEmails.has(a.email))
  const someSelected = selectedEmails.size > 0
  const selectedAdvisors = filtered.filter(a => selectedEmails.has(a.email))

  function toggleSelectAll() {
    if (allPageSelected) {
      const next = new Set(selectedEmails)
      paginated.forEach(a => next.delete(a.email))
      setSelectedEmails(next)
    } else {
      const next = new Set(selectedEmails)
      paginated.forEach(a => next.add(a.email))
      setSelectedEmails(next)
    }
  }

  function toggleSelect(email) {
    const next = new Set(selectedEmails)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    setSelectedEmails(next)
  }

  const batchCourse = courseFilter === 'nssa' ? 'NSSA' : courseFilter === 'irmaa' ? 'IRMAACP' : 'NSSA/IRMAACP'
  const batchEnrollHref = someSelected
    ? buildBatchEnrollmentMailto(selectedAdvisors, batchCourse, activeSupervisorName, activeOrgName)
    : '#'

  function handlePageSize(val) {
    setPageSize(Number(val))
    setPage(1)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

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
            <button onClick={handleLogout} disabled={loggingOut} style={{
              fontSize: '12px', padding: '4px 12px', borderRadius: '6px',
              border: '1px solid #d1d5db', background: 'white', color: '#374151',
              cursor: loggingOut ? 'not-allowed' : 'pointer', opacity: loggingOut ? 0.6 : 1
            }}>
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>

      {/* Admin org filter */}
      {isAdmin && (
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Viewing organization:</label>
          <select style={{ ...selectStyle, minWidth: '240px' }} value={orgFilter}
            onChange={e => { setOrgFilter(e.target.value); setPage(1); setSelectedEmails(new Set()) }}>
            <option value="all">All organizations</option>
            {allPartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
        {[
          { label: 'Enrolled', value: orgFilteredAdvisors.length, color: '#555' },
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

      {/* Filters + batch action */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', minWidth: '220px' }}
        />
        <select style={selectStyle} value={courseFilter}
          onChange={e => { setCourseFilter(e.target.value); setPage(1); setSelectedEmails(new Set()) }}>
          <option value="all">All courses</option>
          <option value="nssa">NSSA only</option>
          <option value="irmaa">IRMAACP only</option>
        </select>
        <select style={selectStyle} value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); setSelectedEmails(new Set()) }}>
          <option value="all">All statuses</option>
          <option value="certified">Certified</option>
          <option value="not-certified">Not certified</option>
          <option value="needs-exam">Needs exam</option>
          <option value="in-progress">In progress</option>
          <option value="not-started">Not started</option>
          <option value="not-enrolled">Not enrolled</option>
        </select>

        {someSelected && (
          <a href={batchEnrollHref} target="_blank" rel="noopener noreferrer" style={{
            fontSize: '13px', padding: '6px 14px', borderRadius: '6px',
            background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
            textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap'
          }}>
            ⬆ Request Enrollment for {selectedEmails.size} selected
          </a>
        )}

        <span style={{ fontSize: '13px', color: '#666', marginLeft: 'auto' }}>
          {filtered.length} student{filtered.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle('#1a1a1a'), width: '40px', cursor: 'default' }}>
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: 14, height: 14 }} title="Select all on this page" />
              </th>
              {[
                { key: 'name', label: 'Student', width: '20%' },
                { key: 'nssa-progress', label: 'NSSA Progress', bg: NSSA.dark },
                { key: 'nssa-exam', label: 'NSSA Exam', bg: NSSA.dark },
                { key: 'nssa-cert', label: 'NSSA Cert', bg: NSSA.dark },
                { key: 'irmaa-progress', label: 'IRMAACP Progress', bg: IRMAA.dark },
                { key: 'irmaa-exam', label: 'IRMAACP Exam', bg: IRMAA.dark },
                { key: 'irmaa-cert', label: 'IRMAACP Cert', bg: IRMAA.dark },
              ].map(col => (
                <th key={col.key} style={{ ...thStyle(col.bg || '#1a1a1a'), width: col.width }}
                  onClick={() => handleSort(col.key)}>
                  {col.label}
                  <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((advisor, i) => (
              <tr key={advisor.email} style={{
                borderTop: i > 0 ? '1px solid #f3f4f6' : 'none',
                background: selectedEmails.has(advisor.email) ? '#f0fdf4' : 'white'
              }}>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedEmails.has(advisor.email)}
                    onChange={() => toggleSelect(advisor.email)}
                    style={{ cursor: 'pointer', width: 14, height: 14 }} />
                </td>
                <td style={td}>
                  <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>{advisor.name || advisor.email}</p>
                  {advisor.name && <p style={{ fontSize: '12px', color: '#666' }}>{advisor.email}</p>}
                </td>
                <CourseColumns course={advisor.nssa} advisor={advisor} courseName="NSSA" supervisorName={activeSupervisorName} orgName={activeOrgName} />
                <CourseColumns course={advisor.irmaa} advisor={advisor} courseName="IRMAACP" supervisorName={activeSupervisorName} orgName={activeOrgName} />
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '13px' }}>
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
                Previous
              </button>
              <span style={{ fontSize: '13px', color: '#666' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <StatusKey />
    </div>
  )
}