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
    .select('*')
    .eq('org_id', STONEBRIDGE_ORG_ID)

  if (progressError || membersError) {
    console.error('Error:', progressError || membersError)
    return { props: { advisors: [] } }
  }

  // Group progress by contact_id
  const advisorMap = {}
  membersData.forEach(m => {
    advisorMap[m.contact_id] = {
      name: m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.email,
      email: m.email,
      nssa: null,
      irmaa: null
    }
  })

  progressData.forEach(p => {
    if (!advisorMap[p.contact_id]) return
    if (p.course === 'NSSA') advisorMap[p.contact_id].nssa = p
    if (p.course === 'IRMAA' || p.course === 'IRMAACP') advisorMap[p.contact_id].irmaa = p
  })

  const advisors = Object.values(advisorMap)

  return { props: { advisors } }
}

function StatusBadge({ pct, examPassed, certified, examPurchased }) {
  if (!pct && pct !== 0) return <span style={{ color: '#999' }}>—</span>
  if (certified) return <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ Certified</span>
  if (examPassed) return <span style={{ color: '#16a34a' }}>✓ Passed</span>
  if (pct === 100 && !examPurchased) return <span style={{ color: '#d97706', fontWeight: 500 }}>Needs exam</span>
  if (pct === 100 && examPurchased) return <span style={{ color: '#2563eb' }}>Exam purchased</span>
  if (pct > 0) return <span style={{ color: '#2563eb' }}>{pct}% complete</span>
  return <span style={{ color: '#dc2626' }}>Not started</span>
}

export default function Dashboard({ advisors }) {
  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
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
              <th style={{ padding:
