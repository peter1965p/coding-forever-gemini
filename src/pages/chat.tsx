import React, { useState, useEffect, useRef } from 'react';
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
}

export const Chat: React.FC<ChatProps> = ({ extName = 'Coding Forever', extVersion = '1.0.0', userName }) => {
  const dynamicName = userName || '';
  const greetingName = dynamicName ? ` ${dynamicName}` : '';

  const [bypass, setBypass] = useState(true);
  const [autoAccept, setAutoAccept] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash-lite');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<MessageItem[]>([
    { sender: 'assistant', text: `Moin${greetingName}! ${extName} ist bereit. Wie kann ich dir heute helfen? 🚀` }
  ]);

  const [prompts, setPrompts] = useState<PromptBlock[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = kein Dropdown offen

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Prompts für Slash-Commands laden
    vscode.postMessage({ command: 'getPrompts' });
    // Kontext-Vorschläge anfragen
    vscode.postMessage({ type: 'suggestNext' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'loadPrompts') {
        setPrompts(message.data);
      } else if (message.type === 'suggestions') {
        setSuggestions(message.data || []);
      } else if (message.type === 'status') {
        setMessages((prev) => [...prev, { sender: 'status', text: message.text }]);
      } else if (message.type === 'response' || message.text || message.content) {
        setMessages((prev) => [...prev, { sender: 'assistant', text: message.text || message.content }]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const postToVsCode = (payload: any) => {
    vscode.postMessage(payload);
  };

  const sendPrompt = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { sender: 'user', text }]);
    setInputText('');
    setSlashQuery(null);
    postToVsCode({ type: 'runChat', prompt: text, model: selectedModel, bypass: bypass, autoAccept: autoAccept });
  };

  const handleSendMessage = () => sendPrompt(inputText);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    const slashMatch = val.match(/(?:^|\s)\/(\S*)$/);
    setSlashQuery(slashMatch ? slashMatch[1] : null);
  };

  const filteredPrompts = slashQuery !== null
    ? prompts.filter(p => p.label.toLowerCase().includes(slashQuery.toLowerCase()) || p.category.toLowerCase().includes(slashQuery.toLowerCase()))
    : [];

  const pickSlashPrompt = (p: PromptBlock) => {
    sendPrompt(p.prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') { setSlashQuery(null); }
  };

  const handleNewChat = () => {
    setMessages([{ sender: 'assistant', text: 'Neuer Chat gestartet. Was gibt es zu tun?' }]);
    postToVsCode({ type: 'suggestNext' });
  };

  return (
    <div style={{
      fontFamily: 'var(--vscode-font-family, sans-serif)', backgroundColor: '#0b0f19', color: '#f9fafb',
      display: 'flex', height: '100vh', overflow: 'hidden', boxSizing: 'border-box'
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
      `}</style>

      {!isSidebarCollapsed && (
        <div style={{ width: '200px', minWidth: '130px', maxWidth: '260px', backgroundColor: '#0f172a', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button onClick={handleNewChat} style={{ background: '#1e293b', color: '#06b6d4', fontWeight: 'bold', border: '1px solid #1f2937', padding: '6px 8px', textAlign: 'left', fontSize: '11px', borderRadius: '6px', cursor: 'pointer' }}>
              ✏️ Neuer Chat
            </button>
            <button onClick={() => postToVsCode({ type: 'openDashboard' })} style={{ background: 'transparent', border: 'none', color: '#f9fafb', padding: '6px 8px', textAlign: 'left', fontSize: '11px', borderRadius: '6px', cursor: 'pointer' }}>
              📊 Dashboard
            </button>
            <button onClick={() => postToVsCode({ type: 'openSettings' })} style={{ background: 'transparent', border: 'none', color: '#f9fafb', padding: '6px 8px', textAlign: 'left', fontSize: '11px', borderRadius: '6px', cursor: 'pointer' }}>
              ⚙️ Einstellungen
            </button>
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', paddingTop: '6px', borderTop: '1px solid #1f2937' }}>
            {extName} v{extVersion}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#0b0f19', minWidth: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #1f2937', fontSize: '12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} style={{ background: 'transparent', border: '1px solid #1f2937', color: '#9ca3af', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '11px' }}>☰</button>
            <span 
    style={{
      position: 'relative',
      backgroundImage: 'linear-gradient(to bottom, #fed7aa, #f97316, #431407)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      filter: 'drop-shadow(0 0 70px rgba(234, 88, 12, 0.5))',
      textTransform: 'uppercase',
      transition: 'all 1s ease'
    }}
  >
    Agentic Chat
  </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: bypass ? '#0fff06' : '#ef4444' }}>Bypass [{bypass ? 'ON' : 'OFF'}]</span>
            <span style={{ color: autoAccept ? '#0fff06' : '#ef4444' }}>Accept [{autoAccept ? 'ON' : 'OFF'}]</span>
          </div>
        </div>

        <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.map((msg, idx) => {
            if (msg.sender === 'status') {
              return (
                <div key={idx} style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', alignSelf: 'flex-start' }}>
                  {msg.text}
                </div>
              );
            }
            return (
              <div key={idx} style={{
                padding: '8px 12px', borderRadius: '8px', fontSize: '12px', maxWidth: '90%', lineHeight: 1.4, wordBreak: 'break-word',
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: msg.sender === 'user' ? '#1e293b' : '#111827', border: '1px solid #1f2937'
              }}>
                {msg.text}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

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

        <div style={{ padding: '10px 14px', backgroundColor: '#111827', borderTop: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
          {filteredPrompts.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '14px', right: '14px', marginBottom: '4px',
              background: '#1e293b', border: '1px solid #374151', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 10
            }}>
              {filteredPrompts.map((p) => (
                <div key={p.id} onClick={() => pickSlashPrompt(p)} style={{ padding: '8px 10px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #374151' }}>
                  <strong>{p.label}</strong>
                  <div style={{ color: '#9ca3af', fontSize: '10px' }}>{p.category}</div>
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
              <option value="gemini-3.7-flash">gemini-3.7-flash</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
    </div>
  );
};