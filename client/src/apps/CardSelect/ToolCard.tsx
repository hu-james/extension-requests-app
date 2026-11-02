
interface ToolCardProps {
    title: string;
    description: string;
    icon: string;
    color: string;
    comingSoon?: boolean;
    onClick?: () => void;
}

export function ToolCard(props: ToolCardProps) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            disabled={props.comingSoon || !props.onClick}
            className="w-full text-left bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow disabled:cursor-not-allowed"
        >
            <img
                src={props.icon}
                alt={props.title}
                className="w-full h-48 object-cover"
            />

            <div className="p-4">
                <h2 className="text-xl font-semibold mb-2">
                    {props.title}
                </h2>

                <p className="text-gray-600">
                    {props.description}
                </p>

                {props.comingSoon && (
                    <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold text-white bg-gray-400 rounded-full">
                        Coming Soon
                    </span>
                )}
            </div>
        </button>
    );
}
