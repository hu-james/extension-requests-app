
import { ToolCard } from './ToolCard';

interface CardSelectViewProps {
    courseId: number;
    userRole: string;
}

export function CardSelectView(props: CardSelectViewProps) {
    function openTool(tool: string) {
        const params = new URLSearchParams(window.location.search);
    
        params.set('tool', tool);
        params.set('course_id', String(props.courseId));
        params.set('role', props.userRole);
    
        window.location.search = params.toString();
    }
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Course Tools</h1>

            {props.userRole === 'instructor' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    
                    <ToolCard
                        title="CSV to Gradebook"
                        description="Upload a CSV file to update Canvas grades."
                        icon="/icons/tools.png"
                        color="blue"
                        onClick={() => openTool('csv-gradebook')}
                    />

                    <ToolCard
                        title="Auto Extend Assignments"
                        description="Automatically extend assignment due dates for students."
                        icon="/icons/tools.png"
                        color="green"
                        onClick={() => openTool('auto-extend')}
                    />

                    <ToolCard
                        title="Recommendation Tool"
                        description="Write recommendation letters for students."
                        icon="/icons/tools.png"
                        color="purple"
                        comingSoon={true}
                    />

                </div>
            ) : props.userRole === 'student' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <ToolCard
                        title="Auto Extend Assignments"
                        description="Automatically extend assignment due dates for students."
                        icon="/icons/extend-icon.png"
                        color="green"
                        onClick={() => openTool('auto-extend')}
                    />
                </div>
            ) : (
                <p>You do not have access to these tools.</p>
            )}
        </div>
    );
}
