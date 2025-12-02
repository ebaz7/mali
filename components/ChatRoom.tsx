
import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, ChatGroup, GroupTask, UserRole } from '../types';
import { getMessages, sendMessage, deleteMessage, getGroups, createGroup, deleteGroup, getTasks, createTask, updateTask, deleteTask, uploadFile, updateGroup } from '../services/storageService';
import { getUsers } from '../services/authService';
import { sendNotification } from '../services/notificationService';
import { generateUUID } from '../constants';
import { Send, User as UserIcon, MessageSquare, Lock, Users, Plus, ListTodo, Paperclip, CheckSquare, Square, Download, X, Trash2, Eye, Reply, Info, Camera, Edit2 } from 'lucide-react';

interface ChatRoomProps { currentUser: User; onNotification: (title: string, msg: string) => void; }
const LAST_READ_KEY = 'chat_last_read_map';

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

    // New State for Group Info Modal
    const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
    const [editingGroupName, setEditingGroupName] = useState('');
    const [uploadingGroupIcon, setUploadingGroupIcon] = useState(false);
    const groupIconInputRef = useRef<HTMLInputElement>(null);


    useEffect(() => { try { const stored = localStorage.getItem(LAST_READ_KEY); if (stored) setLastReadMap(JSON.parse(stored)); } catch (e) { console.error("Failed to load read history"); } }, []);
    useEffect(() => { activeChannelRef.current = activeChannel; const key = getChannelKey(activeChannel.type, activeChannel.id); updateLastRead(key); setReplyingTo(null); }, [activeChannel, activeTab]);
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
                if (msgChannelKey !== currentChannelKey || document.hidden) { const title = `پیام جدید از ${inc.sender}`; const body = inc.message || 'فایل ضمیمه'; sendNotification(title, body); onNotification(title, body); } else { updateLastRead(currentChannelKey); }
            });
        }
        lastMsgCountRef.current = msgs.length;
        const usrList = await getUsers(); setUsers(usrList.filter(u => u.username !== currentUser.username));
        // Group Filtering Logic maintained:
        const grpList = await getGroups(); const isManager = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CEO].includes(currentUser.role); setGroups(grpList.filter(g => isManager || g.members.includes(currentUser.username) || g.createdBy === currentUser.username));
        const tskList = await getTasks(); setTasks(tskList);
    };

    useEffect(() => { loadData(); const interval = setInterval(loadData, 3000); return () => clearInterval(interval); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeChannel, replyingTo]);

    const handleSend = async (e: React.FormEvent, attachment?: {fileName: string, url: string}) => {
        if (e) e.preventDefault();
        if (!inputText.trim() && !attachment) return;
        const newMsg: ChatMessage = { 
            id: generateUUID(), 
            sender: currentUser.fullName, 
            senderUsername: currentUser.username, 
            role: currentUser.role, 
            message: inputText, 
            timestamp: Date.now(), 
            recipient: activeChannel.type === 'private' ? activeChannel.id! : undefined, 
            groupId: activeChannel.type === 'group' ? activeChannel.id! : undefined, 
            attachment: attachment,
            replyTo: replyingTo ? {
                id: replyingTo.id,
                sender: replyingTo.sender,
                message: replyingTo.message || (replyingTo.attachment ? 'فایل ضمیمه' : '...')
            } : undefined
        };
        await sendMessage(newMsg);
        setInputText(''); setShowTagList(false); setReplyingTo(null); const key = getChannelKey(activeChannel.type, activeChannel.id); updateLastRead(key); loadData();
    };
    const handleDeleteMessage = async (id: string) => { if (window.confirm("آیا از حذف این پیام مطمئن هستید؟")) { await deleteMessage(id); loadData(); } };
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 150 * 1024 * 1024) { alert('حجم فایل نباید بیشتر از 150 مگابایت باشد.'); return; } setIsUploading(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); await handleSend(null as any, { fileName: result.fileName, url: result.url }); } catch (error) { alert('خطا در آپلود فایل'); } finally { setIsUploading(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; setInputText(val); if (val.endsWith('@')) { setShowTagList(true); } else if (!val.includes('@')) { setShowTagList(false); } };
    const handleTagUser = (username: string) => { setInputText(prev => prev + username + ' '); setShowTagList(false); inputRef.current?.focus(); };
    const getUnreadCount = (type: 'public' | 'private' | 'group', id: string | null) => { const key = getChannelKey(type, id); const lastRead = lastReadMap[key] || 0; return messages.filter(msg => { if (msg.timestamp <= lastRead) return false; if (msg.senderUsername === currentUser.username) return false; if (type === 'public') return !msg.recipient && !msg.groupId; if (type === 'group') return msg.groupId === id; if (type === 'private') { return (msg.senderUsername === id && msg.recipient === currentUser.username); } return false; }).length; };
    const handleCreateGroup = async () => { if (!newGroupName.trim() || selectedGroupMembers.length === 0) { alert("نام گروه و حداقل یک عضو الزامی است."); return; } const newGroup: ChatGroup = { id: generateUUID(), name: newGroupName, members: [...selectedGroupMembers, currentUser.username], createdBy: currentUser.username }; await createGroup(newGroup); setShowGroupModal(false); setNewGroupName(''); setSelectedGroupMembers([]); loadData(); };
    const handleDeleteGroup = async (id: string) => { if (window.confirm("آیا از حذف این گروه و تمامی محتویات آن مطمئن هستید؟")) { await deleteGroup(id); if (activeChannel.id === id) { setActiveChannel({ type: 'public', id: null }); } loadData(); } };
    const handleAddTask = async () => { if (!newTaskTitle.trim() || !activeChannel.id || activeChannel.type !== 'group') return; const newTask: GroupTask = { id: generateUUID(), groupId: activeChannel.id, title: newTaskTitle, assignee: newTaskAssignee || undefined, isCompleted: false, createdBy: currentUser.username, createdAt: Date.now() }; await createTask(newTask); setNewTaskTitle(''); setNewTaskAssignee(''); loadData(); };
    const toggleTask = async (task: GroupTask) => { await updateTask({ ...task, isCompleted: !task.isCompleted }); loadData(); };
    const handleDeleteTask = async (id: string) => { if (window.confirm("آیا از حذف این تسک مطمئن هستید؟")) { await deleteTask(id); loadData(); } };
    const displayedMessages = messages.filter(msg => { if (activeChannel.type === 'public') return !msg.recipient && !msg.groupId; else if (activeChannel.type === 'private') { const otherUser = activeChannel.id; const isMeSender = msg.senderUsername === currentUser.username; const isMeRecipient = msg.recipient === currentUser.username; const isOtherSender = msg.senderUsername === otherUser; const isOtherRecipient = msg.recipient === otherUser; return (isMeSender && isOtherRecipient) || (isOtherSender && isMeRecipient); } else if (activeChannel.type === 'group') return msg.groupId === activeChannel.id; return false; });
    const activeGroupTasks = tasks.filter(t => activeChannel.type === 'group' && t.groupId === activeChannel.id);
    const isAdminOrManager = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CEO].includes(currentUser.role);
    
    // Group Info Handlers
    const activeGroup = groups.find(g => g.id === activeChannel.id);
    const handleOpenGroupInfo = () => { if (activeGroup) { setEditingGroupName(activeGroup.name); setShowGroupInfoModal(true); } };
    const handleSaveGroupInfo = async () => {
        if (!activeGroup || !editingGroupName.trim()) return;
        const updatedGroup = { ...activeGroup, name: editingGroupName };
        await updateGroup(updatedGroup);
        setShowGroupInfoModal(false);
        loadData();
    };
    const handleGroupIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file || !activeGroup) return;
        setUploadingGroupIcon(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target?.result as string;
            try {
                const result = await uploadFile(file.name, base64);
                const updatedGroup = { ...activeGroup, icon: result.url };
                await updateGroup(updatedGroup);
                loadData();
            } catch (error) { alert('خطا در آپلود'); } finally { setUploadingGroupIcon(false); }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 h-[calc(100vh-140px)] flex overflow-hidden animate-fade-in relative">
            {showGroupModal && (<div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm"><h3 className="font-bold text-lg mb-4">ایجاد گروه جدید</h3><input className="w-full border rounded-lg p-2 mb-4" placeholder="نام گروه" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} /><div className="mb-4 max-h-48 overflow-y-auto border rounded-lg p-2"><label className="text-xs text-gray-500 block mb-2">انتخاب اعضا:</label>{users.map(u => (<div key={u.id} className="flex items-center gap-2 mb-2"><input type="checkbox" checked={selectedGroupMembers.includes(u.username)} onChange={e => { if (e.target.checked) setSelectedGroupMembers([...selectedGroupMembers, u.username]); else setSelectedGroupMembers(selectedGroupMembers.filter(m => m !== u.username)); }} /><span className="text-sm">{u.fullName}</span></div>))}</div><div className="flex gap-2 justify-end"><button onClick={() => setShowGroupModal(false)} className="px-4 py-2 text-sm text-gray-600">انصراف</button><button onClick={handleCreateGroup} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">ایجاد</button></div></div></div>)}
            
            {/* Group Info Modal */}
            {showGroupInfoModal && activeGroup && (
                <div className="absolute inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm flex flex-col h-[500px]">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">اطلاعات گروه</h3>
                            <button onClick={() => setShowGroupInfoModal(false)}><X size={20} className="text-gray-400"/></button>
                        </div>
                        
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-20 h-20 rounded-full bg-gray-200 mb-2 overflow-hidden relative group border">
                                {activeGroup.icon ? <img src={activeGroup.icon} className="w-full h-full object-cover" /> : <Users className="w-full h-full p-4 text-gray-400" />}
                                {(isAdminOrManager || activeGroup.createdBy === currentUser.username) && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" onClick={() => groupIconInputRef.current?.click()}>
                                        <Camera className="text-white" size={24}/>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={groupIconInputRef} className="hidden" accept="image/*" onChange={handleGroupIconChange} />
                            {(isAdminOrManager || activeGroup.createdBy === currentUser.username) ? (
                                <div className="flex items-center gap-2 w-full">
                                    <input className="flex-1 border-b border-gray-300 focus:border-blue-500 outline-none text-center pb-1" value={editingGroupName} onChange={e => setEditingGroupName(e.target.value)} />
                                    <button onClick={handleSaveGroupInfo} className="text-blue-600"><CheckSquare size={18}/></button>
                                </div>
                            ) : (
                                <h4 className="font-bold text-lg">{activeGroup.name}</h4>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto border-t pt-4">
                            <h5 className="text-xs font-bold text-gray-500 mb-3">اعضای گروه ({activeGroup.members.length})</h5>
                            <div className="space-y-2">
                                {activeGroup.members.map(memberUsername => {
                                    const user = [...users, currentUser].find(u => u.username === memberUsername);
                                    return (
                                        <div key={memberUsername} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                                            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                                                {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <UserIcon size={16} className="m-2 text-gray-500"/>}
                                            </div>
                                            <span className="text-sm text-gray-800">{user?.fullName || memberUsername}</span>
                                            {activeGroup.createdBy === memberUsername && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded mr-auto">مالک</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-64 bg-gray-50 border-l border-gray-200 flex flex-col flex-shrink-0"><div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-100"><h3 className="font-bold text-gray-700">لیست گفتگوها</h3><button onClick={() => setShowGroupModal(true)} className="p-1 hover:bg-gray-200 rounded" title="گروه جدید"><Plus size={18} className="text-gray-600" /></button></div><div className="flex-1 overflow-y-auto p-2 space-y-1"><button onClick={() => { setActiveChannel({type: 'public', id: null}); setActiveTab('chat'); }} className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors relative ${activeChannel.type === 'public' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}><div className={`p-2 rounded-full ${activeChannel.type === 'public' ? 'bg-blue-200' : 'bg-gray-200'}`}><Users size={16} /></div><span className="font-medium text-sm">کانال عمومی</span>{getUnreadCount('public', null) > 0 && (<span className="absolute left-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{getUnreadCount('public', null)}</span>)}</button>{groups.length > 0 && (<><div className="text-xs font-bold text-gray-400 px-3 mt-4 mb-2">گروه‌ها</div>{groups.map(g => (<div key={g.id} className="relative group"><button onClick={() => { setActiveChannel({type: 'group', id: g.id}); setActiveTab('chat'); }} className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors relative ${activeChannel.type === 'group' && activeChannel.id === g.id ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-700'}`}><div className={`w-9 h-9 flex items-center justify-center rounded-full overflow-hidden shrink-0 ${activeChannel.type === 'group' && activeChannel.id === g.id ? 'bg-indigo-200' : 'bg-gray-200'}`}>{g.icon ? <img src={g.icon} className="w-full h-full object-cover"/> : <Users size={16} />}</div><span className="font-medium text-sm truncate flex-1">{g.name}</span>{getUnreadCount('group', g.id) > 0 && (<span className="absolute left-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{getUnreadCount('group', g.id)}</span>)}</button>{(isAdminOrManager || g.createdBy === currentUser.username) && (<button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }} className="absolute left-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="حذف گروه"><Trash2 size={14} /></button>)}</div>))}</>)}<div className="text-xs font-bold text-gray-400 px-3 mt-4 mb-2">کاربران (خصوصی)</div>{users.map(u => (<button key={u.id} onClick={() => { setActiveChannel({type: 'private', id: u.username}); setActiveTab('chat'); }} className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-colors relative ${activeChannel.type === 'private' && activeChannel.id === u.username ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}><div className={`w-9 h-9 flex items-center justify-center rounded-full overflow-hidden shrink-0 ${activeChannel.type === 'private' && activeChannel.id === u.username ? 'bg-blue-200' : 'bg-gray-200'}`}>{u.avatar ? <img src={u.avatar} className="w-full h-full object-cover"/> : <UserIcon size={16} />}</div><div className="overflow-hidden"><span className="font-medium text-sm block truncate">{u.fullName}</span></div>{getUnreadCount('private', u.username) > 0 && (<span className="absolute left-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{getUnreadCount('private', u.username)}</span>)}</button>))}</div></div>
            <div className="flex-1 flex flex-col min-w-0"><div className="p-3 border-b border-gray-100 bg-white flex justify-between items-center shadow-sm z-10"><div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-lg text-blue-600">{activeChannel.type === 'private' ? <Lock size={20} /> : activeChannel.type === 'group' ? <ListTodo size={20} /> : <MessageSquare size={20} />}</div><div><h2 className="font-bold text-gray-800">{activeChannel.type === 'public' ? 'کانال عمومی شرکت' : activeChannel.type === 'private' ? users.find(u => u.username === activeChannel.id)?.fullName : groups.find(g => g.id === activeChannel.id)?.name}</h2></div></div><div className="flex items-center gap-2">{activeChannel.type === 'group' && (<><button onClick={handleOpenGroupInfo} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 flex items-center gap-1 text-xs font-bold"><Info size={18}/> <span>اطلاعات گروه</span></button><div className="h-6 w-px bg-gray-300 mx-1"></div><div className="flex bg-gray-100 p-1 rounded-lg"><button onClick={() => setActiveTab('chat')} className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'chat' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500'}`}>گفتگو</button><button onClick={() => setActiveTab('tasks')} className={`px-4 py-1.5 rounded-md text-sm transition-all ${activeTab === 'tasks' ? 'bg-white shadow text-indigo-600 font-medium' : 'text-gray-500'}`}>تسک‌ها</button></div></>)}</div></div>
                {activeTab === 'chat' ? (
                    <><div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">{displayedMessages.map((msg) => { const isMe = msg.senderUsername === currentUser.username; const isRecipient = activeChannel.type === 'private' && msg.recipient === currentUser.username; const canDelete = isAdminOrManager || isMe || isRecipient; const senderUser = [...users, currentUser].find(u => u.username === msg.senderUsername); return (<div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}>
                        <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${isMe ? 'bg-blue-200' : 'bg-gray-200'}`}>
                                {senderUser?.avatar ? <img src={senderUser.avatar} className="w-full h-full object-cover"/> : <UserIcon size={14} className="text-gray-700" />}
                            </div>
                            <div className="flex flex-col">
                                {msg.replyTo && (
                                    <div className={`text-xs mb-1 px-3 py-1.5 rounded-lg border-l-4 ${isMe ? 'bg-blue-100 border-blue-400 self-end mr-2' : 'bg-gray-200 border-gray-400 self-start ml-2'}`}>
                                        <span className="font-bold block mb-0.5">{msg.replyTo.sender}</span>
                                        <span className="truncate block max-w-[150px] opacity-70">{msg.replyTo.message}</span>
                                    </div>
                                )}
                                <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm relative group-hover:shadow-md transition-shadow ${isMe ? 'bg-blue-600 text-white rounded-bl-none' : 'bg-white border border-gray-200 text-gray-800 rounded-br-none'}`}>
                                    <div className={`text-[10px] mb-1 font-bold ${isMe ? 'text-blue-100' : 'text-gray-500'} flex justify-between items-center min-w-[100px]`}>
                                        <span>{msg.sender}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => setReplyingTo(msg)} className={`opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 ${isMe ? 'text-blue-200 hover:text-white' : 'text-gray-400 hover:text-blue-600'}`} title="پاسخ دادن"><Reply size={12} /></button>
                                            {canDelete && (<button onClick={() => handleDeleteMessage(msg.id)} className={`opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 ${isMe ? 'text-blue-200' : 'text-gray-400'}`} title="حذف پیام"><Trash2 size={12} /></button>)}
                                        </div>
                                    </div>
                                    {msg.message && <p>{msg.message}</p>}{msg.attachment && (<div className={`mt-2 p-2 rounded-lg flex items-center gap-2 ${isMe ? 'bg-blue-700/50' : 'bg-gray-50 border border-gray-100'}`}><div className={`p-1.5 rounded-md ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}><Paperclip size={14} /></div><span className={`text-xs truncate flex-1 ${isMe ? 'text-blue-50' : 'text-gray-600'}`} dir="ltr">{msg.attachment.fileName}</span><div className="flex items-center gap-1"><a href={msg.attachment.url} target="_blank" rel="noreferrer" className={`p-1.5 rounded-md transition-colors ${isMe ? 'hover:bg-blue-500 text-blue-100' : 'hover:bg-gray-200 text-gray-500'}`} title="مشاهده"><Eye size={14} /></a><a href={msg.attachment.url} download={msg.attachment.fileName} className={`p-1.5 rounded-md transition-colors ${isMe ? 'hover:bg-blue-500 text-blue-100' : 'hover:bg-gray-200 text-gray-500'}`} title="دانلود"><Download size={14} /></a></div></div>)}
                                </div>
                            </div>
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 mx-12">{new Date(msg.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span></div>); })}<div ref={messagesEndRef} /></div>
                        
                        {/* Reply Preview Bar */}
                        {replyingTo && (
                            <div className="px-4 py-2 bg-gray-100 border-t flex justify-between items-center text-sm animate-fade-in">
                                <div className="flex items-center gap-2 text-gray-600">
                                    <Reply size={16} className="text-blue-500"/>
                                    <span className="font-bold text-blue-600">پاسخ به {replyingTo.sender}:</span>
                                    <span className="truncate max-w-[200px]">{replyingTo.message || 'فایل ضمیمه'}</span>
                                </div>
                                <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-red-500"><X size={18}/></button>
                            </div>
                        )}

                        <form onSubmit={(e) => handleSend(e)} className="p-4 border-t bg-white flex gap-2 items-center relative">{showTagList && (<div className="absolute bottom-20 left-4 bg-white border shadow-xl rounded-xl overflow-hidden w-48 z-20">{users.map(u => (<button key={u.id} type="button" onClick={() => handleTagUser(u.username)} className="block w-full text-right px-4 py-2 hover:bg-gray-100 text-sm">{u.fullName}</button>))}</div>)}<input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" capture onChange={handleFileUpload} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors" title="ارسال فایل (دوربین/گالری)"><Paperclip size={20} /></button><input ref={inputRef} type="text" value={inputText} onChange={handleInputChange} className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder={isUploading ? "در حال ارسال فایل..." : "پیام خود را بنویسید (با @ تگ کنید)..."} disabled={isUploading} /><button type="submit" disabled={isUploading} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-colors shadow-lg shadow-blue-600/20"><Send size={20} /></button></form></>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50"><div className="p-4 border-b bg-white"><div className="flex gap-2"><input className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="عنوان تسک جدید..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} /><select className="border rounded-lg px-3 py-2 text-sm w-40" value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)}><option value="">مسئول (اختیاری)</option>{groups.find(g => g.id === activeChannel.id)?.members.map(m => { const user = users.find(u => u.username === m) || (currentUser.username === m ? currentUser : null); return user ? <option key={m} value={m}>{user.fullName}</option> : null; })}</select><button onClick={handleAddTask} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">افزودن</button></div></div><div className="flex-1 overflow-y-auto p-4 space-y-2">{activeGroupTasks.length === 0 && <div className="text-center text-gray-400 mt-10">هیچ تسکی تعریف نشده است.</div>}{activeGroupTasks.map(task => { const assigneeName = task.assignee ? (users.find(u => u.username === task.assignee)?.fullName || (currentUser.username === task.assignee ? 'خودم' : task.assignee)) : 'نامشخص'; const canDeleteTask = isAdminOrManager || task.createdBy === currentUser.username; return (<div key={task.id} className="bg-white p-3 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm"><div className="flex items-center gap-3"><button onClick={() => toggleTask(task)} className={task.isCompleted ? "text-green-500" : "text-gray-300 hover:text-gray-400"}>{task.isCompleted ? <CheckSquare size={24} /> : <Square size={24} />}</button><div><p className={`font-medium ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p><div className="flex gap-2 text-xs mt-1"><span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded">مسئول: {assigneeName}</span><span className="text-gray-400">{new Date(task.createdAt).toLocaleDateString('fa-IR')}</span></div></div></div>{canDeleteTask && (<button onClick={() => handleDeleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="حذف تسک"><Trash2 size={16} /></button>)}</div>); })}</div></div>
                )}
            </div>
        </div>
    );
};
export default ChatRoom;