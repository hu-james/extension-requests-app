import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StudentView } from './apps/auto-extend/StudentView'
import { InstructorView } from './apps/auto-extend/InstructorView'
import { CSVGradebook } from './apps/csv-to-gradebook/CSVGradebook'
import { CardSelectView } from './apps/CardSelect/CardSelectView';

const queryClient = new QueryClient();

function App() {
  // In a real application, these would come from the LTI launch parameters
  const params = new URLSearchParams(window.location.search)
  const courseId = parseInt(new URLSearchParams(window.location.search).get('course_id') || '0');
  const userRole = new URLSearchParams(window.location.search).get('role') || 'student';
  const tool = params.get('tool')

  return (
    <QueryClientProvider client={queryClient}>
      <div className="container mx-auto">

        {/* Dashboard: Displays the available tools for the user */}
        {!tool && (
          <CardSelectView courseId={courseId} userRole={userRole} />
        )}

        {/* CSV Gradebook: Allows instructors to upload CSV files and update grades */}
        {tool === 'csv-gradebook' && userRole === 'instructor' && (
          <CSVGradebook courseId={courseId} />
        )}

        {/* Auto-Extend: Displays the instructor or student version of the tool */}
        {tool === 'auto-extend' && userRole === 'instructor' && (
          <InstructorView courseId={courseId} />
        )}

        {tool === 'auto-extend' && userRole === 'student' && (
          <StudentView courseId={courseId} />
        )}

        {/* Access denied: Handles invalid tools or unauthorized access */}
        {tool && !(
          (tool === 'csv-gradebook' && userRole === 'instructor') ||
          (tool === 'auto-extend' && (userRole === 'instructor' || userRole === 'student'))
        ) && (
          <p>You do not have access to this tool.</p>
        )}

      </div>
    </QueryClientProvider>
  )
}

export default App
