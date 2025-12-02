
import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, ChatGroup, GroupTask, UserRole } from '../types';
import { getMessages, sendMessage, deleteMessage, getGroups, createGroup, deleteGroup, getTasks, createTask, updateTask, deleteTask, uploadFile, updateGroup, updateMessage } from '../services/storageService';
import { getUsers } from '../services/authService';
import { sendNotification } from '../services/notificationService';
import { generateUUID } from '../constants';
import { Send, User as UserIcon, MessageSquare, Lock, Users, Plus, ListTodo, Paperclip, CheckSquare, Square, Download, X, Trash2, Eye, Reply, Info, Camera, Edit2, ArrowRight, Mic, Smile, StopCircle, Check, Phone, Video, PhoneIncoming } from 'lucide-react';

interface ChatRoomProps { currentUser: User; onNotification: (title: string, msg: string) => void; }
const LAST_READ_KEY = 'chat_last_read_map';

const COMMON_EMOJIS = [
    "👍", "❤️", "😂", "😮", "😢", "😡", "🙏", "🤝", "✅", "👀",
    "😊", "😎", "🤔", "🎉", "🔥", "💯", "👋", "💪", "💐", "🚀",
    "✨", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "❓"
];

const ChatRoom: React.FC<ChatRoomProps> = ({ currentUser, onNotification }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<ChatGroup[]>([]);
    const [tasks, setTasks] = useState<GroupTask[]>([]);
    const [inputText, setInputText] = useState('');
    const [activeChannel, setActiveChannel] = useState<{type: 'public' | 'private' | 'group', id: string | null}>({ type: 'public', id: null });
    const activeChannelRef = useRef(activeChannel);
    const [activeTab, setActiveTab] = useState<'chat' | 'tasks'>('chat'); 
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showTagList, setShowTagList] = useState(false);
    const lastMsgCountRef = useRef(0);
    const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // New State for Reply
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

    // New State for Edit Message
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

    // New State for Group Info Modal
    const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
    const [editingGroupName, setEditingGroupName] = useState('');
    const [uploadingGroupIcon, setUploadingGroupIcon] = useState(false);
    const groupIconInputRef = useRef<HTMLInputElement>(null);
    
    // Voice & Emoji State
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [recordingMimeType, setRecordingMimeType] = useState<string>(''); // Track MIME type
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    // Mobile View State Logic
    const [mobileShowChat, setMobileShowChat] = useState(false);


    useEffect(() => { try { const stored = localStorage.getItem(LAST_READ_KEY); if (stored) setLastReadMap(JSON.parse(stored)); } catch (e) { console.error("Failed to load read history"); } }, []);
    useEffect(() => { activeChannelRef.current = activeChannel; const key = getChannelKey(activeChannel.type, activeChannel.id); updateLastRead(key); setReplyingTo(null); setEditingMessageId(null); setInputText(''); }, [activeChannel, activeTab]);
    const updateLastRead = (key: string) => { setLastReadMap(prev => { const next = { ...prev, [key]: Date.now() }; localStorage.setItem(LAST_READ_KEY, JSON.stringify(next)); return next; }); };
    const getChannelKey = (type: 'public' | 'private' | 'group', id: string | null) => { if (type === 'public') return 'public'; return `${type}_${id}`; };

    const loadData = async () => {
        const msgs = await getMessages();
        const prevCount = lastMsgCountRef.current;
        setMessages(msgs);
        if (prevCount === 0 && msgs.length > 0) lastMsgCountRef.current = msgs.length;
        if (prevCount > 0 && prevCount < msgs.length) {
            const newMsgs = msgs.slice(prevCount);
            const incoming = newMsgs.filter(m => m.senderUsername !== currentUser.username);
            incoming.forEach(inc => {
                const msgChannelKey = inc.groupId ? `group_${inc.groupId}` : inc.recipient ? `private_${inc.senderUsername}` : 'public';
                const currentChannelKey = getChannelKey(activeChannelRef.current.type, activeChannelRef.current.id);
                // Notification Logic
                if (msgChannelKey !== currentChannelKey || document.hidden) { 
                    const title = `پیام جدید از ${inc.sender}`; 
                    // Handle Call Invites in Notification
                    let body = inc.message || (inc.audioUrl ? 'پیام صوتی' : 'فایل ضمیمه'); 
                    if (body.startsWith('CALL_INVITE|')) body = '📞 تماس ورودی...';
                    
                    sendNotification(title, body); 
                    onNotification(title, body); 
                } else { 
                    updateLastRead(currentChannelKey); 
                }
            });
        }
        lastMsgCountRef.current = msgs.length;
        const usrList = await getUsers(); setUsers(usrList.filter(u => u.username !== currentUser.username));
        const grpList = await getGroups(); const isManager = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CEO].includes(currentUser.role); setGroups(grpList.filter(g => isManager || g.members.includes(currentUser.username) || g.createdBy === currentUser.username));
        const tskList = await getTasks(); setTasks(tskList);
    };

    useEffect(() => { loadData(); const interval = setInterval(loadData, 3000); return () => clearInterval(interval); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeChannel, replyingTo, mobileShowChat, editingMessageId]);

    const handleSend = async (e: React.FormEvent | null, attachment?: {fileName: string, url: string}, audioUrl?: string, customText?: string) => {
        if (e) e.preventDefault();
        const msgText = customText || inputText;
        
        if (!msgText.trim() && !attachment && !audioUrl) return;

        if (editingMessageId && !customText) { // Don't edit if it's a call invite
            // Update logic
            const msgToUpdate = messages.find(m => m.id === editingMessageId);
            if (msgToUpdate) {
                const updatedMsg = { ...msgToUpdate, message: msgText, isEdited: true };
                await updateMessage(updatedMsg);
                setEditingMessageId(null);
            }
        } else {
            // New Message Logic
            const newMsg: ChatMessage = { 
                id: generateUUID(), 
                sender: currentUser.fullName, 
                senderUsername: currentUser.username, 
                role: currentUser.role, 
                message: msgText, 
                timestamp: Date.now(), 
                recipient: activeChannel.type === 'private' ? activeChannel.id! : undefined, 
                groupId: activeChannel.type === 'group' ? activeChannel.id! : undefined, 
                attachment: attachment,
                audioUrl: audioUrl,
                replyTo: replyingTo ? {
                    id: replyingTo.id,
                    sender: replyingTo.sender,
                    message: replyingTo.message || (replyingTo.audioUrl ? 'پیام صوتی' : replyingTo.attachment ? 'فایل ضمیمه' : '...')
                } : undefined
            };
            await sendMessage(newMsg);
        }
        
        if (!customText) setInputText(''); 
        setShowTagList(false); 
        setReplyingTo(null); 
        const key = getChannelKey(activeChannel.type, activeChannel.id); 
        updateLastRead(key); 
        loadData();
    };

    const handleDeleteMessage = async (id: string) => { if (window.confirm("آیا از حذف این پیام مطمئن هستید؟")) { await deleteMessage(id); loadData(); } };
    const handleEditMessage = (msg: ChatMessage) => { setEditingMessageId(msg.id); setInputText(msg.message); inputRef.current?.focus(); };
    const handleCancelEdit = () => { setEditingMessageId(null); setInputText(''); };
    
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 150 * 1024 * 1024) { alert('حجم فایل نباید بیشتر از 150 مگابایت باشد.'); return; } setIsUploading(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); await handleSend(null, { fileName: result.fileName, url: result.url }); } catch (error) { alert('خطا در آپلود فایل'); } finally { setIsUploading(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; setInputText(val); if (val.endsWith('@')) { setShowTagList(true); } else if (!val.includes('@')) { setShowTagList(false); } };
    const handleTagUser = (username: string) => { setInputText(prev => prev + username + ' '); setShowTagList(false); inputRef.current?.focus(); };
    const getUnreadCount = (type: 'public' | 'private' | 'group', id: string | null) => { const key = getChannelKey(type, id); const lastRead = lastReadMap[key] || 0; return messages.filter(msg => { if (msg.timestamp <= lastRead) return false; if (msg.senderUsername === currentUser.username) return false; if (type === 'public') return !msg.recipient && !msg.groupId; if (type === 'group') return msg.groupId === id; if (type === 'private') { return (msg.senderUsername === id && msg.recipient === currentUser.username); } return false; }).length; };
    const handleCreateGroup = async () => { if (!newGroupName.trim() || selectedGroupMembers.length === 0) { alert("نام گروه و حداقل یک عضو الزامی است."); return; } const newGroup: ChatGroup = { id: generateUUID(), name: newGroupName, members: [...selectedGroupMembers, currentUser.username], createdBy: currentUser.username }; await createGroup(newGroup); setShowGroupModal(false); setNewGroupName(''); setSelectedGroupMembers([]); loadData(); };
    const handleDeleteGroup = async (id: string) => { if (window.confirm("آیا از حذف این گروه و تمامی محتویات آن مطمئن هستید؟")) { await deleteGroup(id); if (activeChannel.id === id) { setActiveChannel({ type: 'public', id: null }); setMobileShowChat(false); } loadData(); } };
    const handleAddTask = async () => { if (!newTaskTitle.trim() || !activeChannel.id || activeChannel.type !== 'group') return; const newTask: GroupTask = { id: generateUUID(), groupId: activeChannel.id, title: newTaskTitle, assignee: newTaskAssignee || undefined, isCompleted: false, createdBy: currentUser.username, createdAt: Date.now() }; await createTask(newTask); setNewTaskTitle(''); setNewTaskAssignee(''); loadData(); };
    const toggleTask = async (task: GroupTask) => { await updateTask({ ...task, isCompleted: !task.isCompleted }); loadData(); };
    const handleDeleteTask = async (id: string) => { if (window.confirm("آیا از حذف این تسک مطمئن هستید؟")) { await deleteTask(id); loadData(); } };
    const displayedMessages = messages.filter(msg => { if (activeChannel.type === 'public') return !msg.recipient && !msg.groupId; else if (activeChannel.type === 'private') { const otherUser = activeChannel.id; const isMeSender = msg.senderUsername === currentUser.username; const isMeRecipient = msg.recipient === currentUser.username; const isOtherSender = msg.senderUsername === otherUser; const isOtherRecipient = msg.recipient === otherUser; return (isMeSender && isOtherRecipient) || (isOtherSender && isMeRecipient); } else if (activeChannel.type === 'group') return msg.groupId === activeChannel.id; return false; });
    const activeGroupTasks = tasks.filter(t => activeChannel.type === 'group' && t.groupId === activeChannel.id);
    const isAdminOrManager = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CEO].includes(currentUser.role);
    
    // Group Info Handlers
    const activeGroup = groups.find(g => g.id === activeChannel.id);
    const handleOpenGroupInfo = () => { if (activeGroup) { setEditingGroupName(activeGroup.name); setShowGroupInfoModal(true); } };
    const handleSaveGroupInfo = async () => { if (!activeGroup || !editingGroupName.trim()) return; const updatedGroup = { ...activeGroup, name: editingGroupName }; await updateGroup(updatedGroup); setShowGroupInfoModal(false); loadData(); };
    const handleGroupIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file || !activeGroup) return; setUploadingGroupIcon(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); const updatedGroup = { ...activeGroup, icon: result.url }; await updateGroup(updatedGroup); loadData(); } catch (error) { alert('خطا در آپلود'); } finally { setUploadingGroupIcon(false); } }; reader.readAsDataURL(file); };
    const handleSelectChannel = (channel: {type: 'public' | 'private' | 'group', id: string | null}) => { setActiveChannel(channel); setActiveTab('chat'); setMobileShowChat(true); };

    // Emoji Logic
    const handleEmojiClick = (emoji: string) => { setInputText(prev => prev + emoji); setShowEmojiPicker(false); inputRef.current?.focus(); };

    // CALL LOGIC
    const handleStartCall = async (video: boolean) => {
        const roomName = `PaymentSys_${activeChannel.type}_${activeChannel.id || 'public'}_${generateUUID().substring(0, 8)}`;
        // Use Jitsi Meet free service
        const url = `https://meet.jit.si/${roomName}#config.startWithVideoMuted=${!video}&config.prejoinPageEnabled=false`;
        const icon = video ? '📹' : '📞';
        const text = video ? 'تماس تصویری شروع شد' : 'تماس صوتی شروع شد';
        const fullMsg = `CALL_INVITE|${icon} ${text}|${url}`;
        
        await handleSend(null, undefined, undefined, fullMsg);
        
        // Open for caller immediately
        window.open(url, '_blank');
    };


    // Voice Recording Logic (Updated for iOS Support)
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Check for iOS/Safari supported mime types
            let mimeType = '';
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4'; // iOS 14.5+ preferred
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            }

            const options = mimeType ? { mimeType } : undefined;
            const recorder = new MediaRecorder(stream, options);
            setRecordingMimeType(mimeType);

            setMediaRecorder(recorder);
            const chunks: BlobPart[] = [];
            
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = async () => {
                // Create blob with the correctly detected type (or default if detection failed)
                const blob = new Blob(chunks, { type: recordingMimeType || 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    try {
                        setIsUploading(true);
                        // Use correct extension based on type
                        const ext = recordingMimeType.includes('mp4') ? 'm4a' : 'webm';
                        const result = await uploadFile(`voice_${Date.now()}.${ext}`, base64);
                        await handleSend(null, undefined, result.url);
                    } catch (e) {
                        alert("خطا در ارسال پیام صوتی");
                    } finally {
                        setIsUploading(false);
                    }
                };
                stream.getTracks().forEach(track => track.stop());
            };
            
            recorder.start();
            setIsRecording(true);
        } catch (err) {
            alert("برای ضبط صدا، دسترسی به میکروفون الزامی است. (نکته: در آیفون/اندروید باید سایت دارای SSL باشد)");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            setIsRecording(false);
            setMediaRecorder(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 md:h-[calc(100vh-140px)] h-[calc(100vh-180px)] flex overflow-hidden animate-fade-in relative">
            {showGroupModal && (<div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm"><h3 className="font-bold text-lg mb-4">ایجاد گروه جدید</h3><input className="w-full border rounded-lg p-2 mb-4" placeholder="نام گروه" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} /><div className="mb-4 max-h-48 overflow-y-auto border rounded-lg p-2"><label className="text-xs text-gray-500 block mb-2">انتخاب اعضا:</label>{users.map(u => (<div key={u.id} className="flex items-center gap-2 mb-2"><input type="checkbox" checked={selectedGroupMembers.includes(u.username)} onChange={e => { if (e.target.checked) setSelectedGroupMembers([...selectedGroupMembers, u.username]); else setSelectedGroupMembers(selectedGroupMembers.filter(m => m !== u.username)); }} /><span className="text-sm">{u.fullName}</span></div>))}</div><div className="flex gap-2 justify-end"><button onClick={() => setShowGroupModal(false)} className="px-4 py-2 text-sm text-gray-600">انصراف</button><button onClick={handleCreateGroup} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">ایجاد</button></div></div></div>)}
            
            {showGroupInfoModal && activeGroup && (
                <div className="absolute inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm flex flex-col h-[500px]">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">اطلاعات گروه</h3><button onClick={() => setShowGroupInfoModal(false)}><X size={20} className="text-gray-400"/></button></div>
                        <div className="flex flex-col items-center mb-6"><div className="w-20 h-20 rounded-full bg-gray-200 mb-2 overflow-hidden relative group border">{activeGroup.icon ? <img src={activeGroup.icon} className="w-full h-full object-cover" /> : <Users className="w-full h-full p-4 text-gray-400" />}{(isAdminOrManager || activeGroup.createdBy === currentUser.username) && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" onClick={() => groupIconInputRef.current?.click()}><Camera className="text-white" size={24}/></div>)}</div><input type="file" ref={groupIconInputRef} className="hidden" accept="image/*" onChange={handleGroupIconChange} />{(isAdminOrManager || activeGroup.createdBy === currentUser.username) ? (<div className="flex items-center gap-2 w-full"><input className="flex-1 border-b border-gray-300 focus:border-blue-500 outline-none text-center pb-1" value={editingGroupName} onChange={e => setEditingGroupName(e.target.value)} /><button onClick={handleSaveGroupInfo} className="text-blue-600"><CheckSquare size={18}/></button></div>) : (<h4 className="font-bold text-lg">{activeGroup.name}</h4>)}</div>
                        <div className="flex-1 overflow-y-auto border-t pt-4"><h5 className="text-xs font-bold text-gray-500 mb-3">اعضای گروه ({activeGroup.members.length})</h5><div className="space-y-2">{activeGroup.members.map(memberUsername => { const user = [...users, currentUser].find(u => u.username === memberUsername); return (<div key={memberUsername} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg"><div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">{user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <UserIcon size={16} className="m-2 text-gray-500"/>}</div><span className="text-sm text-gray-800">{user?.fullName || memberUsername}</span>{activeGroup.createdBy === memberUsername && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded mr-auto">مالک</span>}</div>); })}</div></div>
                    </div>
                </div>
            )}

            <div className={`md:w-64 w-full bg-gray-50 border-l border-gray-200 flex flex-col flex-shrink-0 transition-all duration-300 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-100">
                    <h3 className="font-bold text-gray-700">لیست گفتگوها</h3>
                    <button onClick={() => setShowGroupModal(true)} className="p-1 hover:bg-gray-200 rounded" title="گروه جدید"><Plus size={18} className="text-gray-600" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <button onClick={() => handleSelectChannel({type: 'public', id: null})} className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors relative ${activeChannel.type === 'public' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}>
                        <div className={`p-2 rounded-full ${activeChannel.type === 'public' ? 'bg-blue-200' : 'bg-gray-200'}`}><Users size={16} /></div>
                        <span className="font-medium text-sm">کانال عمومی</span>
                        {getUnreadCount('public', null) > 0 && (<span className="absolute left-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{getUnreadCount('public', null)}</span>)}
                    </button>
                    {groups.length > 0 && (<><div className="text-xs font-bold text-gray-400 px-3 mt-4 mb-2">گروه‌ها</div>{groups.map(g => (<div key={g.id} className="relative group"><button onClick={() => handleSelectChannel({type: 'group', id: g.id})} className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors relative ${activeChannel.type === 'group' && activeChannel.id === g.id ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-700'}`}><div className={`w-9 h-9 flex items-center justify-center rounded-full overflow-hidden shrink-0 ${activeChannel.type === 'group' && activeChannel.id === g.id ? 'bg-indigo-200' : 'bg-gray-200'}`}>{g.icon ? <img src={g.icon} className="w-full h-full object-cover"/> : <Users size={16} />}</div><span className="font-medium text-sm truncate flex-1">{g.name}</span>{getUnreadCount('group', g.id) > 0 && (<span className="absolute left-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{getUnreadCount('group', g.id)}</span>)}</button>{(isAdminOrManager || g.createdBy === currentUser.username) && (<button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }} className="absolute left-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="حذف گروه"><Trash2 size={14} /></button>)}</div>))}</>)}
                    <div className="text-xs font-bold text-gray-400 px-3 mt-4 mb-2">کاربران (خصوصی)</div>
                    {users.map(u => (<button key={u.id} onClick={() => handleSelectChannel({type: 'private', id: u.username})} className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors relative ${activeChannel.type === 'private' && activeChannel.id === u.username ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}><div className={`w-9 h-9 flex items-center justify-center rounded-full overflow-hidden shrink-0 ${activeChannel.type === 'private' && activeChannel.id === u.username ? 'bg-blue-200' : 'bg-gray-200'}`}>{u.avatar ? <img src={u.avatar} className="w-full h-full object-cover"/> : <UserIcon size={16} />}</div><div className="overflow-hidden"><span className="font-medium text-sm block truncate">{u.fullName}</span></div>{getUnreadCount('private', u.username) > 0 && (<span className="absolute left-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{getUnreadCount('private', u.username)}</span>)}</button>))}
                </div>
            </div>

            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-3 border-b border-gray-100 bg-white flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-2 md:gap-3">
                        <button onClick={() => setMobileShowChat(false)} className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-full"><ArrowRight size={20} /></button>
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600 hidden md:block">{activeChannel.type === 'private' ? <Lock size={20} /> : activeChannel.type === 'group' ? <ListTodo size={20} /> : <MessageSquare size={20} />}</div>
                        <div><h2 className="font-bold text-gray-800 text-sm md:text-base">{activeChannel.type === 'public' ? 'کانال عمومی شرکت' : activeChannel.type === 'private' ? users.find(u => u.username === activeChannel.id)?.fullName : groups.find(g => g.id === activeChannel.id)?.name}</h2></div>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2">
                         {/* CALL BUTTONS */}
                         <button onClick={() => handleStartCall(false)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="تماس صوتی"><Phone size={18} /></button>
                         <button onClick={() => handleStartCall(true)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="تماس تصویری"><Video size={18} /></button>
                         <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        {activeChannel.type === 'group' && (<><button onClick={handleOpenGroupInfo} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 flex items-center gap-1 text-xs font-bold"><Info size={18}/> <span className="hidden md:inline">اطلاعات</span></button><div className="h-6 w-px bg-gray-300 mx-1 hidden md:block"></div><div className="flex bg-gray-100 p-1 rounded-lg"><button onClick={() => setActiveTab('chat')} className={`px-2 md:px-4 py-1.5 rounded-md text-xs md:text-sm transition-all ${activeTab === 'chat' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500'}`}>گفتگو</button><button onClick={() => setActiveTab('tasks')} className={`px-2 md:px-4 py-1.5 rounded-md text-xs md:text-sm transition-all ${activeTab === 'tasks' ? 'bg-white shadow text-indigo-600 font-medium' : 'text-gray-500'}`}>تسک‌ها</button></div></>)}
                    </div>
                </div>
                {activeTab === 'chat' ? (
                    <><div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
                        {displayedMessages.map((msg) => { 
                            const isMe = msg.senderUsername === currentUser.username; 
                            const isRecipient = activeChannel.type === 'private' && msg.recipient === currentUser.username; 
                            const canDelete = isAdminOrManager || isMe || isRecipient; 
                            const senderUser = [...users, currentUser].find(u => u.username === msg.senderUsername); 
                            const isCallInvite = msg.message?.startsWith('CALL_INVITE|');
                            
                            return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group mb-4`}>
                                <div className={`flex items-end gap-2 max-w-[90%] md:max-w-[85%] ${isMe ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${isMe ? 'bg-blue-200' : 'bg-gray-200'}`}>
                                        {senderUser?.avatar ? <img src={senderUser.avatar} className="w-full h-full object-cover"/> : <UserIcon size={14} className="text-gray-700" />}
                                    </div>
                                    <div className="flex flex-col relative w-full">
                                        
                                        {/* Reply Button (Separated) */}
                                        <button 
                                            onClick={() => setReplyingTo(msg)} 
                                            className={`absolute top-1/2 -translate-y-1/2 ${isMe ? '-right-10' : '-left-10'} p-2 rounded-full bg-white shadow-sm border border-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100 z-10 transform hover:scale-110`} 
                                            title="پاسخ"
                                        >
                                            <Reply size={18} />
                                        </button>

                                        {/* Edit/Delete Buttons (Opposite Side) */}
                                        <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? '-left-8' : '-right-8'} flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                            {isMe && !isCallInvite && <button onClick={() => handleEditMessage(msg)} className="text-gray-400 hover:text-amber-500 p-0.5" title="ویرایش"><Edit2 size={14} /></button>}
                                            {canDelete && <button onClick={() => handleDeleteMessage(msg.id)} className="text-gray-400 hover:text-red-500 p-0.5" title="حذف"><Trash2 size={14} /></button>}
                                        </div>

                                        {msg.replyTo && (
                                            <div className={`text-xs mb-1 px-3 py-1.5 rounded-lg border-l-4 ${isMe ? 'bg-blue-100 border-blue-400 self-end mr-2' : 'bg-gray-200 border-gray-400 self-start ml-2'}`}>
                                                <span className="font-bold block mb-0.5">{msg.replyTo.sender}</span>
                                                <span className="truncate block max-w-[150px] opacity-70">{msg.replyTo.message}</span>
                                            </div>
                                        )}
                                        
                                        {isCallInvite ? (
                                            /* Call Invite Card */
                                            <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm border ${isMe ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-full animate-pulse ${isMe ? 'bg-blue-200 text-blue-700' : 'bg-green-200 text-green-700'}`}>
                                                        <PhoneIncoming size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{msg.message.split('|')[1]}</div>
                                                        <div className="text-xs opacity-70 mb-2">برای پیوستن کلیک کنید</div>
                                                        <a href={msg.message.split('|')[2]} target="_blank" rel="noreferrer" className={`block text-center py-1.5 px-4 rounded-lg font-bold text-xs transition-colors ${isMe ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                                            پیوستن به تماس
                                                        </a>
                                                    </div>
                                                </div>
                                                <div className="text-[9px] text-gray-400 text-left mt-2">{new Date(msg.timestamp).toLocaleTimeString('fa-IR')}</div>
                                            </div>
                                        ) : (
                                            /* Normal Message */
                                            <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm relative transition-shadow ${isMe ? 'bg-blue-600 text-white rounded-bl-none' : 'bg-white border border-gray-200 text-gray-800 rounded-br-none'}`}>
                                                <div className={`text-[10px] mb-1 font-bold ${isMe ? 'text-blue-100' : 'text-gray-500'} flex justify-between items-center min-w-[100px]`}>
                                                    <span>{msg.sender}</span>
                                                </div>
                                                {msg.message && <p>{msg.message}</p>}
                                                {msg.audioUrl && (
                                                    <audio 
                                                        key={msg.audioUrl}
                                                        controls 
                                                        className="mt-1 h-8 max-w-[200px]" 
                                                        preload="metadata" 
                                                        playsInline 
                                                    >
                                                        <source src={msg.audioUrl} type={msg.audioUrl.includes('.m4a') ? 'audio/mp4' : 'audio/webm'} />
                                                        <source src={msg.audioUrl} />
                                                    </audio>
                                                )}
                                                {msg.attachment && (<div className={`mt-2 p-2 rounded-lg flex items-center gap-2 ${isMe ? 'bg-blue-700/50' : 'bg-gray-50 border border-gray-100'}`}><div className={`p-1.5 rounded-md ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}><Paperclip size={14} /></div><span className={`text-xs truncate flex-1 ${isMe ? 'text-blue-50' : 'text-gray-600'}`} dir="ltr">{msg.attachment.fileName}</span><div className="flex items-center gap-1"><a href={msg.attachment.url} target="_blank" rel="noreferrer" className={`p-1.5 rounded-md transition-colors ${isMe ? 'hover:bg-blue-500 text-blue-100' : 'hover:bg-gray-200 text-gray-500'}`} title="مشاهده"><Eye size={14} /></a><a href={msg.attachment.url} download={msg.attachment.fileName} className={`p-1.5 rounded-md transition-colors ${isMe ? 'hover:bg-blue-500 text-blue-100' : 'hover:bg-gray-200 text-gray-500'}`} title="دانلود"><Download size={14} /></a></div></div>)}
                                                <div className="flex justify-end gap-1 mt-1">
                                                    {msg.isEdited && <span className={`text-[9px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>(ویرایش شده)</span>}
                                                    <span className={`text-[10px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{new Date(msg.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ); })}<div ref={messagesEndRef} /></div>
                        
                        {/* Reply / Edit Preview Bar */}
                        {(replyingTo || editingMessageId) && (
                            <div className="px-4 py-2 bg-gray-100 border-t flex justify-between items-center text-sm animate-fade-in">
                                {replyingTo && (
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <Reply size={16} className="text-blue-500"/>
                                        <span className="font-bold text-blue-600">پاسخ به {replyingTo.sender}:</span>
                                        <span className="truncate max-w-[150px] md:max-w-[200px]">{replyingTo.message || 'فایل/صدا'}</span>
                                    </div>
                                )}
                                {editingMessageId && (
                                    <div className="flex items-center gap-2 text-gray-600">
                                        <Edit2 size={16} className="text-amber-500"/>
                                        <span className="font-bold text-amber-600">در حال ویرایش پیام...</span>
                                    </div>
                                )}
                                <button onClick={() => { setReplyingTo(null); handleCancelEdit(); }} className="text-gray-400 hover:text-red-500"><X size={18}/></button>
                            </div>
                        )}

                        <form onSubmit={(e) => handleSend(e, undefined, undefined, undefined)} className="p-4 border-t bg-white flex gap-2 items-center relative">
                            {showTagList && (<div className="absolute bottom-20 left-4 bg-white border shadow-xl rounded-xl overflow-hidden w-48 z-20">{users.map(u => (<button key={u.id} type="button" onClick={() => handleTagUser(u.username)} className="block w-full text-right px-4 py-2 hover:bg-gray-100 text-sm">{u.fullName}</button>))}</div>)}
                            
                            {showEmojiPicker && (
                                <div className="absolute bottom-20 right-4 bg-white border shadow-xl rounded-xl p-3 z-20 w-64">
                                    <div className="grid grid-cols-6 gap-2">
                                        {COMMON_EMOJIS.map(emoji => (
                                            <button key={emoji} type="button" onClick={() => handleEmojiClick(emoji)} className="text-xl hover:bg-gray-100 rounded p-1">{emoji}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" capture onChange={handleFileUpload} />
                            
                            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading || !!editingMessageId} className="p-2 md:p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors" title="ارسال فایل"><Paperclip size={20} /></button>
                            
                            {!isRecording ? (
                                <button type="button" onClick={handleStartRecording} disabled={!!editingMessageId} className={`p-2 md:p-3 rounded-xl bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 transition-colors ${editingMessageId ? 'opacity-50' : ''}`} title="ضبط صدا"><Mic size={20} /></button>
                            ) : (
                                <button type="button" onClick={handleStopRecording} className="p-2 md:p-3 rounded-xl bg-red-100 text-red-600 animate-pulse transition-colors" title="توقف ضبط"><StopCircle size={20} /></button>
                            )}

                            <div className="flex-1 relative">
                                <input ref={inputRef} type="text" value={inputText} onChange={handleInputChange} className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder={isUploading ? "در حال ارسال فایل..." : isRecording ? "در حال ضبط صدا..." : "پیام..."} disabled={isUploading || isRecording} />
                                <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-yellow-500"><Smile size={20}/></button>
                            </div>

                            <button type="submit" disabled={isUploading || isRecording} className={`text-white p-3 rounded-xl transition-colors shadow-lg ${editingMessageId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'}`}>
                                {editingMessageId ? <Check size={20}/> : <Send size={20} />}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50"><div className="p-4 border-b bg-white"><div className="flex flex-col md:flex-row gap-2"><input className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="عنوان تسک جدید..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} /><select className="border rounded-lg px-3 py-2 text-sm w-full md:w-40" value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)}><option value="">مسئول (اختیاری)</option>{groups.find(g => g.id === activeChannel.id)?.members.map(m => { const user = users.find(u => u.username === m) || (currentUser.username === m ? currentUser : null); return user ? <option key={m} value={m}>{user.fullName}</option> : null; })}</select><button onClick={handleAddTask} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">افزودن</button></div></div><div className="flex-1 overflow-y-auto p-4 space-y-2">{activeGroupTasks.length === 0 && <div className="text-center text-gray-400 mt-10">هیچ تسکی تعریف نشده است.</div>}{activeGroupTasks.map(task => { const assigneeName = task.assignee ? (users.find(u => u.username === task.assignee)?.fullName || (currentUser.username === task.assignee ? 'خودم' : task.assignee)) : 'نامشخص'; const canDeleteTask = isAdminOrManager || task.createdBy === currentUser.username; return (<div key={task.id} className="bg-white p-3 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm"><div className="flex items-center gap-3"><button onClick={() => toggleTask(task)} className={task.isCompleted ? "text-green-500" : "text-gray-300 hover:text-gray-400"}>{task.isCompleted ? <CheckSquare size={24} /> : <Square size={24} />}</button><div><p className={`font-medium ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p><div className="flex gap-2 text-xs mt-1"><span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded">مسئول: {assigneeName}</span><span className="text-gray-400">{new Date(task.createdAt).toLocaleDateString('fa-IR')}</span></div></div></div>{canDeleteTask && (<button onClick={() => handleDeleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="حذف تسک"><Trash2 size={16} /></button>)}</div>); })}</div></div>
                )}
            </div>
        </div>
    );
};
export default ChatRoom;
