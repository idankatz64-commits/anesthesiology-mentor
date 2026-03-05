import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { useEffect, useCallback, useState } from 'react';
import { Bold, Underline as UnderlineIcon, List, ListOrdered, ArrowLeftRight, Link2 } from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  editable?: boolean;
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = '',
  minHeight = '80px',
  editable = true,
}: RichTextEditorProps) {
  const [isRtl, setIsRtl] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary underline hover:text-primary/80',
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `outline-none prose prose-sm max-w-none text-foreground`,
        dir: isRtl ? 'rtl' : 'ltr',
        style: `min-height: ${minHeight}; padding: 1rem;`,
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
  });

  // Update editor direction when RTL toggle changes
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `outline-none prose prose-sm max-w-none text-foreground`,
            dir: isRtl ? 'rtl' : 'ltr',
            style: `min-height: ${minHeight}; padding: 1rem;`,
            ...(placeholder ? { 'data-placeholder': placeholder } : {}),
          },
        },
      });
    }
  }, [isRtl, editor, minHeight, placeholder]);

  // Sync external content changes (e.g., switching questions)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const toggleDirection = useCallback(() => {
    setIsRtl(prev => !prev);
  }, []);

  const handleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('הכנס כתובת URL:');
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition text-xs ${
        isActive
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-muted">
      {editable && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/80">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            onClick={handleLink}
            isActive={editor.isActive('link')}
            title={editor.isActive('link') ? 'הסר קישור' : 'הוסף קישור'}
          >
            <Link2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            onClick={toggleDirection}
            isActive={false}
            title={isRtl ? 'Switch to LTR' : 'Switch to RTL'}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </ToolbarButton>
          <span className="text-[10px] text-muted-foreground ml-1">{isRtl ? 'RTL' : 'LTR'}</span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
