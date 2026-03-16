import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
// @ts-ignore - tiptap image extension types
import Image from '@tiptap/extension-image';
import { useEffect, useCallback, useState, useRef } from 'react';
import { Bold, Underline as UnderlineIcon, List, ListOrdered, ArrowLeftRight, Link2, ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      Image.configure({ inline: false, allowBase64: false }),
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
      handleKeyDown: (_view, event) => {
        if (event.key === 'Tab') {
          if (event.shiftKey) {
            editor?.chain().focus().liftListItem('listItem').run();
          } else {
            editor?.chain().focus().sinkListItem('listItem').run();
          }
          event.preventDefault();
          return true;
        }
        return false;
      },
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
          handleKeyDown: (_view, event) => {
            if (event.key === 'Tab') {
              if (event.shiftKey) {
                editor.chain().focus().liftListItem('listItem').run();
              } else {
                editor.chain().focus().sinkListItem('listItem').run();
              }
              event.preventDefault();
              return true;
            }
            return false;
          },
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

  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor || !file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('question-images').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('question-images').getPublicUrl(path);
      editor.chain().focus().setImage({ src: data.publicUrl }).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      console.error('Upload error:', msg);
      alert(`שגיאה בהעלאת התמונה:\n${msg}`);
    } finally {
      setUploading(false);
    }
  }, [editor]);

  // Clipboard paste support
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageUpload(file);
          return;
        }
      }
    };
    el.addEventListener('paste', handler);
    return () => el.removeEventListener('paste', handler);
  }, [editor, handleImageUpload]);

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
            onClick={() => fileInputRef.current?.click()}
            isActive={false}
            title="העלה תמונה"
          >
            {uploading
              ? <span className="text-[10px]">...</span>
              : <ImagePlus className="w-3.5 h-3.5" />
            }
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
          />
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
