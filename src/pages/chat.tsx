import React, { useState, useEffect, useRef } from 'react';
import { SquarePen, LayoutDashboard, Settings, History } from 'lucide-react';
import { vscode } from '../lib/vscodeApi';

interface MessageItem {
  sender: 'user' | 'assistant' | 'status';
  text: string;
}

interface PromptBlock {
  id: string;
  label: string;
  category: string;
  description: string;
  prompt: string;
  scope: 'global' | 'workspace';
}

interface ChatProps {
  extName?: string;
  extVersion?: string;
  userName?: string;
  onNavigate?: (route: string) => void;
  onNewChat?: () => void;
}

export const Chat: React.FC<ChatProps> = ({ extName = 'Coding Forever', userName }) => {
  const dynamicName = userName || '';
  const greetingName = dynamicName ? ` ${dynamicName}` : '';

  const [agentMode, setAgentMode] = useState(true);
  const [bypass, setBypass] = useState(true);
  const [autoAccept, setAutoAccept] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
  const [inputText, setInputText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    { sender: 'assistant', text: `Moin${greetingName}! ${extName} ist bereit. Wie kann ich dir heute helfen? 🚀` }
  ]);

  const [prompts, setPrompts] = useState<PromptBlock[]>([]);
  const [suggestions] = useState<string[]>([]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const postToVsCode = (payload: any) => {
    vscode.postMessage(payload);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listener ZUERST registrieren, DANACH Prompts anfordern
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'toggleHistory') {
        setShowHistory((prev) => !prev);
      } else if (message.type === 'setPrompt') {
        setInputText(message.value);
      } else if (message.type === 'loadPrompts' || message.type === 'setPrompts' || message.type === 'promptsLoaded') {
        const receivedPrompts = message.prompts || message.value || message.data || [];
        setPrompts(receivedPrompts);
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Nach Registrierung des Listeners die Daten anfordern
    postToVsCode({ type: 'getPrompts' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const sendPrompt = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { sender: 'user', text }]);
    setInputText('');
    setSlashQuery(null);
    postToVsCode({
      type: 'runChat',
      prompt: text,
      model: selectedModel,
      agentMode: agentMode,
      bypass: bypass,
      autoAccept: autoAccept
    });
  };

  const handleSendMessage = () => sendPrompt(inputText);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Robuste Erkennung: Prüft ob der Text mit '/' beginnt oder ein '/' getippt wird
    if (val.startsWith('/')) {
      setSlashQuery(val.slice(1)); // Nimmt den Suchtext nach dem '/'
    } else {
      const slashMatch = val.match(/(?:^|\s)\/(\S*)$/);
      setSlashQuery(slashMatch ? slashMatch[1] : null);
    }
  };

  const filteredPrompts = slashQuery !== null
    ? prompts.filter(p => 
        (p.label && p.label.toLowerCase().includes(slashQuery.toLowerCase())) || 
        (p.category && p.category.toLowerCase().includes(slashQuery.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(slashQuery.toLowerCase()))
      )
    : [];

  const pickSlashPrompt = (p: PromptBlock) => {
    setInputText(p.prompt);
    setSlashQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') { 
      setSlashQuery(null); 
    }
  };

  const handleNewChat = () => {
    setMessages([{ sender: 'assistant', text: 'Neuer Chat gestartet. Was gibt es zu tun?' }]);
    postToVsCode({ type: 'suggestNext' });
  };

  const triggerCodeDiff = (rawText: string) => {
    const codeMatch = rawText.match(/```(?:\w+)?\n([\s\S]*?)```/);
    const cleanCode = codeMatch ? codeMatch[1] : rawText;
    postToVsCode({ type: 'showDiff', code: cleanCode });
  };

  return (
    <div style={{
      fontFamily: 'var(--vscode-font-family, sans-serif)', backgroundColor: '#0b0f19', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', boxSizing: 'border-box',
      position: 'relative'
    }}>
      <style>{`
        .switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #374151;
          transition: .2s;
          border-radius: 20px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .2s;
          border-radius: 50%;
        }
        .switch input:checked + .slider {
          background-color: #ff6200;
        }
        .switch input:checked + .slider:before {
          transform: translateX(16px);
        }
        .icon-btn {
          background: transparent;
          border: 1px solid #1f2937;
          color: #9ca3af;
          border-radius: 4px;
          cursor: pointer;
          padding: 4px 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s;
        }
        .icon-btn:hover {
          background: #1e293b;
          color: #ff6200;
        }
      `}</style>

      {/* OVERLAY SIDEBAR DRAWER FÜR HISTORY */}
      {showHistory && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '260px', height: '100%',
          backgroundColor: '#0f172a', zIndex: 100, borderLeft: '1px solid #334155',
          padding: '16px', boxShadow: '-4px 0 15px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '13px' }}>Verlauf</span>
            <button 
              onClick={() => setShowHistory(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Keine vergangenen Chats vorhanden.
          </div>
        </div>
      )}

      {/* TOP HEADER / TOOLBAR */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1f2937', fontSize: '12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827', flexShrink: 0 }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={handleNewChat} className="icon-btn" title="Neuer Chat">
            <SquarePen size={15} />
          </button>
          <button onClick={() => postToVsCode({ type: 'openDashboard' })} className="icon-btn" title="Dashboard">
            <LayoutDashboard size={15} />
          </button>
          <button onClick={() => postToVsCode({ type: 'openSettings' })} className="icon-btn" title="Einstellungen">
            <Settings size={15} />
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className="icon-btn" title="Verlauf">
            <History size={15} />
          </button>

          <span 
            style={{
              position: 'relative',
              backgroundImage: 'linear-gradient(to bottom, #fed7aa, #f97316, #431407)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textTransform: 'uppercase',
              marginLeft: '6px'
            }}
          >
            Agentic Chat
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
          <span style={{ color: agentMode ? '#0fff06' : '#ef4444' }}>Agent [{agentMode ? 'ON' : 'OFF'}]</span>
          <span style={{ color: bypass ? '#0fff06' : '#ef4444' }}>Bypass [{bypass ? 'ON' : 'OFF'}]</span>
          <span style={{ color: autoAccept ? '#0fff06' : '#ef4444' }}>Accept [{autoAccept ? 'ON' : 'OFF'}]</span>
        </div>
      </div>

      {/* CHAT MESSAGES AREA */}
      <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((msg, idx) => {
          if (msg.sender === 'status') {
            return (
              <div key={idx} style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', alignSelf: 'flex-start' }}>
                {msg.text}
              </div>
            );
          }

          const containsCode = msg.text.includes('```');

          return (
            <div key={idx} style={{
              padding: '8px 12px', borderRadius: '8px', fontSize: '12px', maxWidth: '90%', lineHeight: 1.4, wordBreak: 'break-word',
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.sender === 'user' ? '#1e293b' : '#111827', border: '1px solid #1f2937',
              display: 'flex', flexDirection: 'column', gap: '6px'
            }}>
              <div>{msg.text}</div>
              
              {msg.sender === 'assistant' && containsCode && (
                <button 
                  onClick={() => triggerCodeDiff(msg.text)}
                  style={{
                    alignSelf: 'flex-start', background: '#1e293b', border: '1px solid #ff6200', color: '#ff6200',
                    padding: '2px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', marginTop: '4px'
                  }}
                >
                  🔍 Diff vergleichen
                </button>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* SUGGESTIONS */}
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => sendPrompt(s)} style={{
              background: '#1e293b', border: '1px solid #374151', color: '#ff6200', borderRadius: '999px',
              padding: '4px 10px', fontSize: '11px', cursor: 'pointer'
            }}>
              💡 {s}
            </button>
          ))}
        </div>
      )}

      {/* INPUT AREA */}
      <div style={{ padding: '10px 14px', backgroundColor: '#111827', borderTop: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', flexShrink: 0 }}>
        
        {/* PROMPT DROPDOWN */}
        {slashQuery !== null && filteredPrompts.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: '14px', right: '14px', marginBottom: '4px',
            background: '#1e293b', border: '1px solid #ff6200', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}>
            {filteredPrompts.map((p) => (
              <div 
                key={p.id || p.label} 
                onClick={() => pickSlashPrompt(p)} 
                style={{ padding: '8px 10px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #374151' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <strong style={{ color: '#ff6200' }}>{p.label}</strong>
                <div style={{ color: '#9ca3af', fontSize: '10px' }}>{p.category} — {p.description}</div>
              </div>
            ))}
          </div>
        )}
        
        <textarea
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Was soll gebaut werden? ('/' für gespeicherte Prompts, Ctrl+Enter zum Senden)"
          style={{ width: '100%', background: '#0b0f19', border: '1px solid #1f2937', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '12px', resize: 'none', height: '48px', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ background: '#0b0f19', border: '1px solid #1f2937', color: '#f9fafb', padding: '4px 6px', borderRadius: '4px', fontSize: '11px' }}>
            <option value="gemini-3.6-flash">gemini-3.6-flash</option>
            <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
              <label className="switch">
                <input type="checkbox" checked={agentMode} onChange={(e) => setAgentMode(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span>Agent</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
              <label className="switch">
                <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span>Bypass</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
              <label className="switch">
                <input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span>Accept All</span>
            </div>
          </div>

          <button onClick={handleSendMessage} style={{ background: '#ff6200', color: '#fefefe', border: 'none', padding: '6px 14px', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
            Senden
          </button>
        </div>
      </div>
    </div>
  );
};