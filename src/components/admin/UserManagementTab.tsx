import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, X, UserPlus } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  role: string | null;
  created_at: string | null;
}

export default function UserManagementTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Add user state
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [adding, setAdding] = useState(false);

  // Edit role state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  // Delete state
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      toast.error('שגיאה בטעינת משתמשים: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!newEmail.trim()) { toast.error('יש להזין כתובת אימייל'); return; }
    setAdding(true);
    try {
      // Look up user by email in auth - we need an edge function or just insert by email
      // Since admin_users.id is UUID referencing auth user, we need the user's ID
      // For now, we'll search for the user in auth via a workaround
      // Actually, looking at the table schema, id is the PK and email is required
      // We need to find the auth user ID by email
      const { data: { users: authUsers }, error: searchError } = await (supabase as any).auth.admin.listUsers();
      
      // If admin API isn't available, try inserting with a generated UUID
      // The admin_users table just needs id + email + role
      // Let's use an edge function approach or just generate an ID
      
      // Simple approach: generate a UUID placeholder - but this won't match auth.uid()
      // Better: use the edge function to look up user
      
      // For now, let's try to find user via RPC or direct approach
      // Actually since the RLS check uses auth.uid() = id, the id MUST match the auth user's ID
      // We'll need to handle this differently - let admin add by email and resolve later
      
      const { error } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'add', email: newEmail.trim(), role: newRole }
      });

      if (error) throw error;
      toast.success('המשתמש נוסף בהצלחה');
      setShowAdd(false);
      setNewEmail('');
      setNewRole('editor');
      fetchUsers();
    } catch (err: any) {
      toast.error('שגיאה בהוספת משתמש: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId: string) => {
    setSavingRole(true);
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ role: editRole })
        .eq('id', userId);
      if (error) throw error;
      toast.success('התפקיד עודכן בהצלחה');
      setEditingId(null);
      fetchUsers();
    } catch (err: any) {
      toast.error('שגיאה בעדכון תפקיד: ' + err.message);
    } finally {
      setSavingRole(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('admin_users')
        .delete()
        .eq('id', deleteUser.id);
      if (error) throw error;
      toast.success('המשתמש הוסר בהצלחה');
      setDeleteUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error('שגיאה במחיקת משתמש: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">User Management</h2>
          <p className="text-sm text-muted-foreground">ניהול משתמשי אדמין ({users.length} משתמשים)</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <UserPlus className="w-4 h-4" />
          הוסף משתמש
        </Button>
      </div>

      {/* Users Table */}
      <div className="glass-card rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">אימייל</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">תפקיד</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">תאריך הוספה</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-muted-foreground">
                    אין משתמשי אדמין
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{user.email}</td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <div className="flex items-center gap-2">
                          <Select value={editRole} onValueChange={setEditRole}>
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => handleRoleChange(user.id)}
                            disabled={savingRole}
                          >
                            {savingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-primary" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(user.id); setEditRole(user.role || 'editor'); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                        >
                          {user.role || 'editor'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteUser(user)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת משתמש אדמין</DialogTitle>
            <DialogDescription>הזן את כתובת האימייל של המשתמש הרשום במערכת</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">אימייל</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">תפקיד</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              <X className="w-4 h-4 ml-1" /> ביטול
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Plus className="w-4 h-4 ml-1" />}
              הוסף
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>הסרת משתמש אדמין</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך להסיר את {deleteUser?.email} מרשימת האדמינים? פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Trash2 className="w-4 h-4 ml-1" />}
              הסר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
