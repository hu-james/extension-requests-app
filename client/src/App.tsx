import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StudentView } from './pages/StudentView'
import { InstructorView } from './pages/InstructorView'

const queryClient = new QueryClient();

function App() {
  // In a real application, these would come from the LTI launch parameters
  const courseId = parseInt(new URLSearchParams(window.location.search).get('course_id') || '0');
  const userRole = new URLSearchParams(window.location.search).get('role') || 'student';

  return (
    <QueryClientProvider client={queryClient}>
      <div className="container mx-auto">
        {userRole === 'instructor' ? (
          <InstructorView courseId={courseId} />
        ) : (
          <StudentView courseId={courseId} />
        )}
      </div>
    </QueryClientProvider>
  )
}

export default App
