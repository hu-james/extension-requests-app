
import { useState } from 'react';
import { assignmentApi } from '../../services/api';
import type { Assignment} from '../../types';
import { useQuery } from '@tanstack/react-query';

type GradeRow = {
    studentId: string;
    studentEmail: string;
    score: string;
}

//props
interface CSVGradebookProps {
  courseId: number;
}

interface SelectAssignmentProps {
  courseId: number;
  selectedAssignmentId: string;
  setSelectedAssignmentId: (id: string) => void;
}


function parseCsv(text: string): GradeRow[] {
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
  
    if (lines.length === 0) return []
  
    const parseLine = (line: string): string[] => {
      const values: string[] = []
      let value = ''
      let quoted = false
  
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
  
        if (char === '"' && line[i + 1] === '"' && quoted) {
          value += '"'
          i++
        } else if (char === '"') {
          quoted = !quoted
        } else if (char === ',' && !quoted) {
          values.push(value.trim())
          value = ''
        } else {
          value += char
        }
      }
  
      values.push(value.trim())
      return values
    }
  
    const firstRow = parseLine(lines[0])
  
    const headers = firstRow.map((value) =>
        value.toLowerCase().trim().replace(/[\s-]+/g, '_'),
    )

    const idIndex = headers.findIndex((value) =>
        /^(ufid|student_id|studentid|id)$/.test(value),
    )
  
    const emailIndex = headers.findIndex((value) =>
      /^(email|student_email|studentemail|email_address)$/.test(value),
    )
  
    const scoreIndex = headers.findIndex((value) =>
      /^(score|grade|points|mark|points_earned)$/.test(value),
    )
  
    const hasHeader =
      idIndex !== -1 || emailIndex !== -1 || scoreIndex !== -1
  
    const dataLines = hasHeader ? lines.slice(1) : lines
  
    // Without headers, assume the first column is an identifier
    // and the second column is the score.
    const identifierIndex = 0
    const fallbackScoreIndex = 1
  
    return dataLines.map((line) => {
      const columns = parseLine(line)
  
      const studentId =
        idIndex !== -1
          ? columns[idIndex] ?? ''
          : !hasHeader && /^\d+$/.test(columns[identifierIndex] ?? '')
            ? columns[identifierIndex]
            : ''
  
      const studentEmail =
        emailIndex !== -1
          ? columns[emailIndex] ?? ''
          : !hasHeader && (columns[identifierIndex] ?? '').includes('@')
            ? columns[identifierIndex]
            : ''
  
      const score =
        scoreIndex !== -1
          ? columns[scoreIndex] ?? ''
          : columns[fallbackScoreIndex] ?? ''
  
      return { studentId, studentEmail, score }
    })
  }


export function SelectAssignment({courseId,selectedAssignmentId,setSelectedAssignmentId}: SelectAssignmentProps) {
  const {
    data: assignments = [],
    isError: assignmentsLoadFailed,
    isLoading: assignmentsLoading,
    refetch: refetchAssignments
  } = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => assignmentApi.getAssignments(courseId),
    retry: false
  });

  if (assignmentsLoading) {
    return <p>Loading assignments...</p>;
  }

  if (assignmentsLoadFailed){
    return (
      <div>
        <p className="text-red-600">Failed to load assignments.</p>
        <button
          onClick={() => refetchAssignments()}
          className="mt-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );}

  if (assignments.length === 0) {
    return <p>No assignments found for this course.</p>;
  }

  return (
    <select
    value={selectedAssignmentId}
    onChange={(e) => setSelectedAssignmentId(e.target.value)}
    >
      {assignments.map((assignment: Assignment) => (
        <option key={assignment.id} value={assignment.id}>
          {assignment.title}
        </option>
      ))}
    </select>
  );

}


export function CSVGradebook({ courseId }: CSVGradebookProps) {
    const [csvText, setCsvText] = useState('');
    const [error, setError] = useState('');
    const rows = parseCsv(csvText);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState('');

    //debugging
    console.log('CSV Gradebook courseId:', courseId);

    async function handleFile(file?: File) {
        if (!file) return;

        if(!file.name.endsWith('.csv')) {
            setError('Please upload a CSV file.');
            return;
        }

        setError('');
        setCsvText(await file.text());
    }

    return (
        <main className="mx-auto max-w-4xl space-y-8 p-8">
            <h1 className="text-3xl font-bold">CSV to Gradebook</h1>
            <p className="text-gray-700">
                Upload a CSV file with student identifiers and grades.
            </p>

            <SelectAssignment courseId={courseId} selectedAssignmentId={selectedAssignmentId} setSelectedAssignmentId={setSelectedAssignmentId}/>

            <div className="space-y-4">
                <label htmlFor="csv-upload" className="block text-sm font-medium text-gray-700">
                    Upload CSV File
                </label>
                <input
                    type="file"
                    id="csv-upload"
                    accept=".csv"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                />
            </div>

            <p>{rows.length} student rows detected</p>

            <div>
                <label htmlFor="csv-data" className="mb-2 block font-semibold">
                    Or Paste CSV data
                </label>
                <textarea
                    id="csv-data"
                    rows={6}
                    value={csvText}
                    onChange={(e) =>{
                        setCsvText(e.target.value)
                        setError('')
                    } }
                    placeholder={'student_id,email,grade\n12345678,jane@ufl.edu,92'}
                    className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm"
                  />
            </div>

            {error && <p role='alert' className="text-red-600">{error}</p>}
            </main>
    )

}

