import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function getServerSideProps() {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .order('last_updated', { ascending: false })

  if (error) {
    console.error('Supabase error:', error)
    return { props: { data: [] } }
  }

  return { props: { data: data || [] } }
}

export default function Dashboard({ data }) {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Partner Dashboard</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>{data.length} records found</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ padding: '12px', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '12px', textAlign: 'left' }}>Course</th>
            <th style={{ padding: '12px', textAlign: 'left' }}>Progress</th>
            <th style={{ padding: '12px', textAlign: 'left' }}>Exam</th>
            <th style={{ padding: '12px', textAlign: 'left' }}>Certified</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '12px' }}>{row.email}</td>
              <td style={{ padding: '12px' }}>{row.course}</td>
              <td style={{ padding: '12px' }}>{row.pct_complete}%</td>
              <td style={{ padding: '12px' }}>{row.exam_passed ? '✓ Passed' : row.exam_purchased ? 'Purchased' : '—'}</td>
              <td style={{ padding: '12px' }}>{row.certified ? '✓ Certified' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
