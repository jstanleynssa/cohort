import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { useState, useMemo } from 'react'
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/router'

const TRAINING_URL = 'https://www.nssapros.com/login'
const ENROLLMENT_EMAIL = 'engage@nssapros.com'
const NSSA = { light: '#8ECAEE', medium: '#1C80BC', dark: '#13405E' }
const IRMAA = { light: '#ED8E8E', medium: '#DE5B63', dark: '#AF2A35' }
const GRAY = { text: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' }

const supabase = createBrowserSupabaseClient()

export async function getServerSideProps(context) {
  const supabaseServer = createServerSupabaseClient(context)
  const { data: { session } } = await supabaseServer.auth.getSession()
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const { data: profile } = await supabaseServer
    .from('user_profiles').select('*').eq('id', session.user.id).single()

  const isAdmin = profile?.is_admin === true

  let allPartners = []
  if (isAdmin) {
    const { data: partners } = await supabaseServer
      .from('partners').select('id, name, contact_name').order('name')
    allPartners = partners || []
  }

  const orgId = isAdmin ? null : profile?.org_id
  let partnerData = null
  if (!isAdmin && orgId) {
    const { data } = await supabaseServer
      .from('partners').select('name, contact_name').eq('id', orgId).single()
    partnerData = data
  }

  let progressQuery = supabaseServer.from('advisor_progress').select('*').order('email')
  if (!isAdmin && orgId) progressQuery = progressQuery.eq('org_id', orgId)

  const { data: progressData, error } = await progressQuery
  if (error) {
    console.error('Error:', error)
    return { props: { advisors: [], orgName: isAdmin ? 'Admin' : (partnerData?.name || ''), supervisorName: '', isAdmin, allPartners, userEmail: session.user.email } }
  }

  const advisorMap = {}
  progressData.forEach(p => {
    if (!advisorMap[p.email]) {
      const fullName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null
      advisorMap[p.email] = { name: fullName, email: p.email, org_id: p.org_id, nssa: null, irmaa: null }
    }
    if (p.course === 'NSSA') advisorMap[p.email].nssa = p
    if (p.course === 'IRMAA' || p.course === 'IRMAACP') advisorMap[p.email].irmaa = p
  })

  return {
    props: {
      advisors: Object.values(advisorMap),
      orgName: isAdmin ? 'Admin' : (partnerData?.name || 'Dashboard'),
      supervisorName: partnerData?.contact_name || '',
      isAdmin, allPartners, userEmail: session.user.email
    }
  }
}

function getExamPurchaseUrl(advisor, course) {
  const hasNssa = advisor.nssa?.exam_purchased || advisor.nssa?.exam_passed
  const hasIrmaa = advisor.irmaa?.exam_purchased || advisor.irmaa?.exam_passed
  if (course === 'NSSA') return hasIrmaa
    ? 'https://www.nssapros.com/offers/4YpLpE8j/checkout'
    : 'https://www.nssapros.com/offers/GJSX238b/checkout'
  if (course === 'IRMAACP') return hasNssa
    ? 'https://www.nssapros.com/offers/bqt32vof/checkout'
    : 'https://www.nssapros.com/offers/8sL5Vhk8/checkout'
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
    `We would love to see you make some progress — the certification will be a valuable addition to your practice.\n\n` +
    `Click here to continue your training:\n${TRAINING_URL}\n\n` +
    `Best regards,\n${supervisorName || 'Your Training Coordinator'}`
  )
  return `mailto:${advisor.email}?subject=${subject}&body=${body}`
}

function buildExamPurchaseMailto(advisor, course, supervisorName) {
  const firstName = advisor.name ? advisor.name.split(' ')[0] : advisor.email
  const courseName = course === 'NSSA' ? 'NSSA® Social Security' : 'IRMAACP™ Medicare & IRMAA'
  const purchaseUrl = getExamPurchaseUrl(advisor, course)
  const subject = encodeURIComponent(`Your ${courseName} Certification Exam`)
  const body = encodeURIComponent(
    `Hi ${firstName},\n\n` +
    `${supervisorName ? supervisorName + ' wanted to reach out' : 'We wanted to check in'} and encourage you to purchase your ${courseName} certification exam.\n\n` +
    `You can purchase your exam here:\n${purchaseUrl}\n\n` +
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
    `${supervisorName || 'I'} would like to request enrollment for the following student in the ${courseName} course:\n\n` +
    `Name: ${studentName}\nEmail: ${advisor.email}\n` +
    (orgName ? `Organization: ${orgName}\n` : '') +
    `\nBest regards,\n${supervisorName || 'Training Coordinator'}`
  )
  return `mailto:${ENROLLMENT_EMAIL}?subject=${subject}&body=${body}`
}

function buildBatchEnrollmentMailto(selectedAdvisors, course, supervisorName, orgName) {
  const courseName = course === 'NSSA' ? 'NSSA® Social Security'
    : course === 'IRMAACP' ? 'IRMAACP™ Medicare & IRMAA' : 'NSSA® / IRMAACP™'
  const subject = encodeURIComponent(`Enrollment Request: ${selectedAdvisors.length} Students — ${courseName}`)
  const studentList = selectedAdvisors.map(a => `  • ${a.name || a.email} (${a.email})`).join('\n')
  const body = encodeURIComponent(
    `Hi NSSA Team,\n\n` +
    `${supervisorName || 'I'} would like to request enrollment for the following ${selectedAdvisors.length} student${selectedAdvisors.length !== 1 ? 's' : ''} in the ${courseName} course:\n\n` +
    studentList + '\n\n' +
    (orgName ? `Organization: ${orgName}\n\n` : '') +
    `Best regards,\n${supervisorName || 'Training Coordinator'}`
  )
  return `mailto:${ENROLLMENT_EMAIL}?subject=${subject}&body=${body}`
}

function pct(num, den) {
  if (!den) return '0%'
  return Math.round((num / den) * 100) + '%'
}

function ActionPill({ href, color, bg, border, label, tooltip }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={tooltip} style={{
      display: 'inline-block', fontSize: '13px', padding: '1px 7px',
      borderRadius: '4px', background: bg, color, textDecoration: 'none',
      border: `1px solid ${border}`, cursor: 'pointer', fontWeight: 400
    }}>{label} +</a>
  )
}

function ProgressStatus({ course, advisor, courseName, supervisorName }) {
  const accent = courseName === 'NSSA' ? NSSA.medium : IRMAA.medium
  if (!course) return null
  const p = course.pct_complete
  if (p === 100) return <span style={{ color: accent, fontWeight: 500 }}>Complete</span>
  const href = buildNudgeMailto(advisor, courseName, supervisorName)
  if (p > 0) return (
    <ActionPill href={href} color={GRAY.text} bg={GRAY.bg} border={GRAY.border}
      label={`${p}% complete`}
      tooltip={`Click to email ${advisor.name || advisor.email} and encourage them to finish the course`} />
  )
  return (
    <ActionPill href={href} color={GRAY.text} bg={GRAY.bg} border={GRAY.border}
      label="Not started"
      tooltip={`Click to email ${advisor.name || advisor.email} and encourage them to start the course`} />
  )
}

function ExamStatus({ course, advisor, courseName, supervisorName }) {
  const accent = courseName === 'NSSA' ? NSSA.medium : IRMAA.medium
  if (!course) return <span style={{ color: '#999' }}>—</span>
  if (course.exam_passed) return <span style={{ color: accent, fontWeight: 500 }}>✓ Passed</span>
  if (course.exam_purchased) return <span style={{ color: accent }}>Purchased</span>
  const href = buildExamPurchaseMailto(advisor, courseName, supervisorName)
  return (
    <ActionPill href={href} color={GRAY.text} bg={GRAY.bg} border={GRAY.border}
      label="Not purchased"
      tooltip={`Click to email ${advisor.name || advisor.email} with a link to purchase the ${courseName} exam`} />
  )
}

function CertStatus({ course, courseName }) {
  const accent = courseName === 'NSSA' ? NSSA.medium : IRMAA.medium
  if (!course) return <span style={{ color: '#999' }}>—</span>
  if (course.certified) return <span style={{ color: accent, fontWeight: 500 }}>✓ Certified</span>
  return <span style={{ color: '#999' }}>—</span>
}

function CourseColumns({ course, advisor, courseName, supervisorName, orgName }) {
  if (!course) {
    const href = buildEnrollmentMailto(advisor, courseName, supervisorName, orgName)
    return (
      <>
        <td style={td}>
          <ActionPill href={href} color={GRAY.text} bg={GRAY.bg} border={GRAY.border}
            label="Not enrolled"
            tooltip={`Click to email NSSA and request enrollment for ${advisor.name || advisor.email} in the ${courseName} course`} />
        </td>
        <td style={td}><span style={{ color: '#999' }}>—</span></td>
        <td style={td}><span style={{ color: '#999' }}>—</span></td>
      </>
    )
  }
  return (
    <>
      <td style={td}><ProgressStatus course={course} advisor={advisor} courseName={courseName} supervisorName={supervisorName} /></td>
      <td style={td}><ExamStatus course={course} advisor={advisor} courseName={courseName} supervisorName={supervisorName} /></td>
      <td style={td}><CertStatus course={course} courseName={courseName} /></td>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: NSSA.light, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: NSSA.light, fontWeight: 500 }}>NSSA Enrolled</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: NSSA.medium, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: NSSA.medium, fontWeight: 500 }}>NSSA Course Completed / Exam Passed</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: NSSA.dark, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: NSSA.dark, fontWeight: 500 }}>NSSA Certified</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: IRMAA.light, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: IRMAA.light, fontWeight: 500 }}>IRMAACP Enrolled</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: IRMAA.medium, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: IRMAA.medium, fontWeight: 500 }}>IRMAACP Course Completed / Exam Passed</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: IRMAA.dark, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: IRMAA.dark, fontWeight: 500 }}>IRMAACP Certified</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: GRAY.text, fontWeight: 600 }}>●</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}><span style={{ color: GRAY.text, fontWeight: 500 }}>Not started / In progress / Not purchased / Not enrolled</span></span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actionable statuses — hover for details, click to send email</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {[
            { label: 'Not started +', desc: 'Emails student to encourage starting the course' },
            { label: '62.5% complete +', desc: 'Emails student to encourage finishing the course' },
            { label: 'Not purchased +', desc: 'Emails student with link to purchase their exam' },
            { label: 'Not enrolled +', desc: 'Emails NSSA to request enrollment for this student' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', background: GRAY.bg, border: `1px solid ${GRAY.border}`, borderRadius: '4px', padding: '1px 7px', color: GRAY.text }}>{item.label}</span>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>— {item.desc}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 7px', color: '#15803d' }}>⬆ Request Enrollment (X selected)</span>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>— Batch email NSSA to enroll multiple selected students</span>
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
    return allPartners.find(p => p.id === orgFilter)?.name || 'Admin'
  }, [isAdmin, orgFilter, allPartners, orgName])

  const activeSupervisorName = useMemo(() => {
    if (!isAdmin) return supervisorName
    if (orgFilter === 'all') return ''
    return allPartners.find(p => p.id === orgFilter)?.contact_name || ''
  }, [isAdmin, orgFilter, allPartners, supervisorName])

  const activeOrgName = useMemo(() => {
    if (!isAdmin) return orgName
    if (orgFilter === 'all') return ''
    return allPartners.find(p => p.id === orgFilter)?.name || ''
  }, [isAdmin, orgFilter, allPartners, orgName])

  const totalAdvisors = orgFilteredAdvisors.length
  const nssaEnrolled = orgFilteredAdvisors.filter(a => a.nssa).length
  const irmaaEnrolled = orgFilteredAdvisors.filter(a => a.irmaa).length
  const nssaCertified = orgFilteredAdvisors.filter(a => a.nssa?.certified).length
  const irmaaCertified = orgFilteredAdvisors.filter(a => a.irmaa?.certified).length
  const nssaComplete = orgFilteredAdvisors.filter(a => a.nssa?.pct_complete === 100).length
  const irmaaComplete = orgFilteredAdvisors.filter(a => a.irmaa?.pct_complete === 100).length

  const kpiCards = [
    { label: 'Enrolled', value: totalAdvisors, color: '#374151' },
    { label: 'NSSA Enrolled', value: nssaEnrolled, sub: pct(nssaEnrolled, totalAdvisors) + ' of cohort', color: NSSA.light, barVal: nssaEnrolled, barTotal: totalAdvisors },
    { label: 'NSSA Course Completed', value: nssaComplete, sub: pct(nssaComplete, nssaEnrolled) + ' of NSSA enrolled', color: NSSA.medium, barVal: nssaComplete, barTotal: nssaEnrolled },
    { label: 'NSSA Certified', value: nssaCertified, sub: pct(nssaCertified, nssaEnrolled) + ' of NSSA enrolled', color: NSSA.dark, barVal: nssaCertified, barTotal: nssaEnrolled },
    { label: 'IRMAACP Enrolled', value: irmaaEnrolled, sub: pct(irmaaEnrolled, totalAdvisors) + ' of cohort', color: IRMAA.light, barVal: irmaaEnrolled, barTotal: totalAdvisors },
    { label: 'IRMAACP Course Completed', value: irmaaComplete, sub: pct(irmaaComplete, irmaaEnrolled) + ' of IRMAACP enrolled', color: IRMAA.medium, barVal: irmaaComplete, barTotal: irmaaEnrolled },
    { label: 'IRMAACP Certified', value: irmaaCertified, sub: pct(irmaaCertified, irmaaEnrolled) + ' of IRMAACP enrolled', color: IRMAA.dark, barVal: irmaaCertified, barTotal: irmaaEnrolled },
  ]

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const filtered = useMemo(() => {
    let list = [...orgFilteredAdvisors]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a => (a.name && a.name.toLowerCase().includes(q)) || a.email.toLowerCase().includes(q))
    }
    if (courseFilter === 'nssa' && statusFilter !== 'not-enrolled') list = list.filter(a => a.nssa)
    if (courseFilter === 'irmaa' && statusFilter !== 'not-enrolled') list = list.filter(a => a.irmaa)
    list = list.filter(a => matchesStatus(a, statusFilter, courseFilter))
    list.sort((a, b) => {
      const av = getSortValue(a, sortCol), bv = getSortValue(b, sortCol)
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
    const next = new Set(selectedEmails)
    if (allPageSelected) paginated.forEach(a => next.delete(a.email))
    else paginated.forEach(a => next.add(a.email))
    setSelectedEmails(next)
  }

  function toggleSelect(email) {
    const next = new Set(selectedEmails)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    setSelectedEmails(next)
  }

  const batchCourse = courseFilter === 'nssa' ? 'NSSA' : courseFilter === 'irmaa' ? 'IRMAACP' : 'NSSA/IRMAACP'
  const batchEnrollHref = someSelected ? buildBatchEnrollmentMailto(selectedAdvisors, batchCourse, activeSupervisorName, activeOrgName) : '#'

  const headerCols = [
    { key: 'name', label: 'Student', bg: '#1a1a1a', width: '20%' },
    { key: 'nssa-progress', label: 'NSSA Progress', bg: NSSA.dark },
    { key: 'nssa-exam', label: 'NSSA Exam', bg: NSSA.dark },
    { key: 'nssa-cert', label: 'NSSA Cert', bg: NSSA.dark },
    { key: 'irmaa-progress', label: 'IRMAACP Progress', bg: IRMAA.dark },
    { key: 'irmaa-exam', label: 'IRMAACP Exam', bg: IRMAA.dark },
    { key: 'irmaa-cert', label: 'IRMAACP Cert', bg: IRMAA.dark },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>{displayOrgName} Training Dashboard</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>{totalAdvisors} students enrolled</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
          <img src="/nssa-irmaa-logos.png" alt="NSSA and IRMAACP logos" style={{ height: '50px', width: 'auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>{userEmail}</span>
            <button onClick={handleLogout} disabled={loggingOut} style={{
              fontSize: '12px', padding: '4px 12px', borderRadius: '6px',
              border: '1px solid #d1d5db', background: 'white', color: '#374151',
              cursor: loggingOut ? 'not-allowed' : 'pointer', opacity: loggingOut ? 0.6 : 1
            }}>{loggingOut ? 'Signing out...' : 'Sign out'}</button>
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

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginBottom: '2rem' }}>
        {kpiCards.map(stat => (
          <div key={stat.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{stat.label}</p>
            <p style={{ fontSize: '22px', fontWeight: 600, color: stat.color }}>{stat.value}</p>
            {stat.sub && <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{stat.sub}</p>}
            {stat.barTotal ? <MetricBar value={stat.barVal} total={stat.barTotal} color={stat.color} /> : null}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search by name or email..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ fontSize: '13px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', minWidth: '220px' }} />
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
          }}>⬆ Request Enrollment for {selectedEmails.size} selected</a>
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
              {headerCols.map(col => (
                <th key={col.key} style={{ ...thStyle(col.bg), width: col.width }} onClick={() => handleSort(col.key)}>
                  {col.label}<SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
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
              <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                No students match the current filters
              </td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6', background: '#fafafa', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Show</span>
            <select style={{ ...selectStyle, padding: '4px 8px' }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={100}>100</option>
            </select>
            <span style={{ fontSize: '13px', color: '#666' }}>per page</span>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>Previous</button>
              <span style={{ fontSize: '13px', color: '#666' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ fontSize: '13px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>Next</button>
            </div>
          )}
        </div>
      </div>

      <StatusKey />
    </div>
  )
}