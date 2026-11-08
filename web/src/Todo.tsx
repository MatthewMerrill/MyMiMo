import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface Task {
    id: number,
    brief: string,
}

export default function TodoApp() {
    let {status, data: tasks, error} = useQuery({
        queryKey: ['tasks'],
        queryFn: () => fetch('http://localhost:3000/tasks')
            .then(res => res.json())
    });
    console.log(status, tasks, error);
    return <ul>
        {tasks &&tasks.map((task: Task) => <li key={task.id}>
            <p>{task.brief}</p>
        </li>)}
    </ul>
}