// src/components/ui/CopyButton.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button'; // Assuming Shadcn/ui Button
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
    textToCopy: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ textToCopy }) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => {
                setIsCopied(false);
            }, 2000); // Reset icon after 2 seconds
        });
    };

    return (
        <Button
            type="button" // This is the critical fix
            onClick={handleCopy}
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
        >
            {isCopied ? (
                <Check className="h-4 w-4 text-green-500" />
            ) : (
                <Copy className="h-4 w-4" />
            )}
            <span className="sr-only">Copy to clipboard</span>
        </Button>
    );
};