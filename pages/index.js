import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const STONEBRIDGE_ORG_ID = '9b736a98-f0d3-4930-b377-83b9e30bb9e0'

export async function getServerSideProps() {
  const { data: progressData, error: progressError } = await supabase
    .from('progress')
    .select('*')
    .eq('org_id', STONEBRIDGE_ORG_ID)
    .order('email')

  const { data: membersData, error: membersError } = await supabase
    .from('members')
    .select('contact_id, first_name, last_name, email')
    .eq('org_id', STONEBRIDGE_ORG_ID)

  if (progressError || membersError) {
    console.error('Error:', progressError || membersError)
    return { props: { advisors: [] } }
  }

  const memberLookup = {}
  membersData.forEach(m => {
    memberLookup[m.email] = m
  })

  const advisorMap = {}
  progressData.forEach(p => {
    if (!advisorMap[p.email]) {
      const member = memberLookup[p.email]
      const fullName = member?.first_name && member?.last_name
        ? `${member.first_name} ${member.last_name}`
        : null
      advisorMap[p.email] = {
        name: fullName,
        email: p.email,
        nssa: null,
        irmaa: null
      }
    }
    if (p.course === 'NSSA') advisorMap[p.email].nssa = p
    if (p.course === 'IRMAA' || p.course === 'IRMAACP') advisorMap[p.email].irmaa = p
  })

  const advisors = Object.values(advisorMap)
  return { props: { advisors } }
}

function ProgressBadge({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: '#999' }}>—</span>
  if (pct === 100) return <span style={{ color: '#16a34a', fontWeight: 500 }}>Complete</span>
  if (pct > 0) return <span style={{ color: '#2563eb' }}>{pct}% complete</span>
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

const td = { padding: '12px 16px', fontSize: '13px' }
const th = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#666' }

export default function Dashboard({ advisors }) {
  return (
    <div style={{ padding: '2rem', maxWidth: '1300px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>Stonebridge Wealth</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>{advisors.length} advisors enrolled</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '2rem' }}>
        {[
          { label: 'Enrolled', value: advisors.length },
          { label: 'NSSA Certified', value: advisors.filter(a => a.nssa?.certified).length },
          { label: 'IRMAACP Certified', value: advisors.filter(a => a.irmaa?.certified).length },
          { label: 'Needs Exam', value: advisors.filter(a => (a.nssa?.pct_complete === 100 && !a.nssa?.exam_purchased) || (a.irmaa?.pct_complete === 100 && !a.irmaa?.exam_purchased)).length }
        ].map(stat => (
          <div key={stat.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>{stat.label}</p>
            <p style={{ fontSize: '24px', fontWeight: 600 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ ...th, width: '22%' }}>Advisor</th>
              <th style={{ ...th, background: '#f0f4ff' }}>NSSA Progress</th>
              <th style={{ ...th, background: '#f0f4ff' }}>NSSA Exam</th>
              <th style={{ ...th, background: '#f0f4ff' }}>NSSA Cert</th>
              <th style={{ ...th, background: '#f0fff4' }}>IRMAACP Progress</th>
              <th style={{ ...th, background: '#f0fff4' }}>IRMAACP Exam</th>
              <th style={{ ...th, background: '#f0fff4' }}>IRMAACP Cert</th>
            </tr>
          </thead>
          <tbody>
            {advisors.map((advisor, i) => (
              <tr key={advisor.email} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                <td style={{ ...td }}>
                  <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>
                    {advisor.name || advisor.email}
                  </p>
                  {advisor.name && (
                    <p style={{ fontSize: '12px', color: '#666' }}>{advisor.email}</p>
                  )}
                </td>
                <CourseColumns course={advisor.nssa} />
                <CourseColumns course={advisor.irmaa} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
