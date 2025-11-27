import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Pencil, Trash2, MessageSquare, X, Check, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Comment } from '@shared/schema';

interface CommentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transactionHash: string;
  transactionDescription: string;
}

export function CommentsPanel({ 
  isOpen, 
  onClose, 
  transactionHash, 
  transactionDescription 
}: CommentsPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: commentsData, isLoading } = useQuery<{ success: boolean; comments: Comment[] }>({
    queryKey: ['/api/comments', transactionHash],
    queryFn: () => fetch(`/api/comments?transactionHash=${encodeURIComponent(transactionHash)}`, {
      credentials: 'include',
    }).then(res => res.json()),
    enabled: isOpen && !!transactionHash,
  });
  
  const comments = commentsData?.comments || [];
  
  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest('POST', '/api/comments', { transactionHash, content });
      return res.json();
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['/api/comments', transactionHash] });
      queryClient.invalidateQueries({ queryKey: ['/api/comments/counts'] });
      toast({ title: 'Comment added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add comment', description: error.message, variant: 'destructive' });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest('PUT', `/api/comments/${id}`, { content });
      return res.json();
    },
    onSuccess: () => {
      setEditingCommentId(null);
      setEditContent('');
      queryClient.invalidateQueries({ queryKey: ['/api/comments', transactionHash] });
      toast({ title: 'Comment updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update comment', description: error.message, variant: 'destructive' });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/comments/${id}`);
      return res.json();
    },
    onSuccess: () => {
      setDeleteCommentId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/comments', transactionHash] });
      queryClient.invalidateQueries({ queryKey: ['/api/comments/counts'] });
      toast({ title: 'Comment deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete comment', description: error.message, variant: 'destructive' });
    },
  });
  
  const handleSubmit = () => {
    if (newComment.trim()) {
      createMutation.mutate(newComment.trim());
    }
  };
  
  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };
  
  const handleSaveEdit = () => {
    if (editingCommentId && editContent.trim()) {
      updateMutation.mutate({ id: editingCommentId, content: editContent.trim() });
    }
  };
  
  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent('');
  };
  
  const handleConfirmDelete = () => {
    if (deleteCommentId) {
      deleteMutation.mutate(deleteCommentId);
    }
  };
  
  const formatDate = (dateStr: string | Date) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return String(dateStr);
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Trade Notes
            </SheetTitle>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {transactionDescription}
            </p>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto mt-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No notes yet</p>
                <p className="text-sm">Add your first note below</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div 
                  key={comment.id} 
                  className="p-3 rounded-lg bg-muted/50 space-y-2"
                  data-testid={`comment-${comment.id}`}
                >
                  {editingCommentId === comment.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[80px]"
                        data-testid="input-edit-comment"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          data-testid="button-cancel-edit"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={updateMutation.isPending || !editContent.trim()}
                          data-testid="button-save-edit"
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                          {comment.updatedAt !== comment.createdAt && ' (edited)'}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleEdit(comment)}
                            data-testid={`button-edit-comment-${comment.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteCommentId(comment.id)}
                            data-testid={`button-delete-comment-${comment.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          
          <div className="border-t pt-4 mt-4 space-y-2">
            <Textarea
              placeholder="Add a note about this trade..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-new-comment"
            />
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !newComment.trim()}
              data-testid="button-add-comment"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4 mr-2" />
              )}
              Add Note
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      
      <AlertDialog open={!!deleteCommentId} onOpenChange={(open) => !open && setDeleteCommentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
