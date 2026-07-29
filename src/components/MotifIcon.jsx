import { useState } from 'react';
import { Film, Clapperboard, Ticket } from 'lucide-react'

const ICONS = [Film, Clapperboard, Ticket]

export default function MotifIcon() {
    const [Icon] = useState(() => ICONS[Math.floor(Math.random() * ICONS.length)])
    return (
        <div className='motif-icon'>
            <Icon size={40} strokeWidth={1.5} />
        </div>
    )
}