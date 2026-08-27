import React, { useState, useEffect, useRef } from 'react';
import { vscode } from '../lib/vscodeApi';

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

interface MessageItem {
  sender: 'user' | 'assistant';
  text: string;
}

interface ChatProps {
  extName?: string;
  extVersion?: string;
  userName?: string;
}

export const Chat: React.FC<ChatProps> = ({
  extName = 'Coding Forever',
  extVersion = '1.0.0',
  userName
}) => {
  const dynamicName = userName || (typeof process !== 'undefined' ? process.env.USER || process.env.USERNAME : '') || '';
  const greetingName = dynamicName ? ` ${dynamicName}` : '';

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash-lite');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      sender: 'assistant',
      text: `Moin${greetingName}! ${extName} ist bereit. Wie kann ich dir heute helfen? 🚀`
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'response' || message.text || message.content) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: message.text || message.content
          }
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const postToVsCode = (payload: any) => {
    vscode.postMessage(payload);
  };

  const handleSendMessage = () => {
    const text = inputText.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { sender: 'user', text }]);
    setInputText('');

    postToVsCode({
      type: 'runChat',
      prompt: text,
      model: selectedModel,
      bypass: true,
      autoAccept: true
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        sender: 'assistant',
        text: 'Neuer Chat gestartet. Was gibt es zu tun?'
      }
    ]);
  };

  return (
    <div style={{
      fontFamily: 'var(--vscode-font-family, sans-serif)',
      backgroundColor: '#0b0f19',
      color: '#f9fafb',
      margin: 0,
      padding: 0,
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      <style>{`
        .nav-btn:hover { background-color: #1e293b !important; }
        .history-item:hover { background-color: #1e293b !important; color: #f9fafb !important; }
        .toggle-sidebar-btn:hover { color: #f9fafb !important; background-color: #1e293b !important; }
        .chat-textarea:focus { outline: none; border-color: #06b6d4 !important; }
        .send-btn:hover { opacity: 0.9; }
      `}</style>

      {/* Linke Sidebar */}
      {!isSidebarCollapsed && (
        <div style={{
          width: '200px',
          minWidth: '130px',
          maxWidth: '260px',
          backgroundColor: '#0f172a',
          borderRight: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '10px',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease-in-out'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={handleNewChat}
              className="nav-btn"
              style={{
                background: '#1e293b',
                color: '#06b6d4',
                fontWeight: 'bold',
                border: '1px solid #1f2937',
                padding: '6px 8px',
                textAlign: 'left',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              <span>✏️</span> Neuer Chat
            </button>

            <button
              onClick={() => postToVsCode({ type: 'openDashboard' })}
              className="nav-btn"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f9fafb',
                padding: '6px 8px',
                textAlign: 'left',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              <span>📊</span> Dashboard
            </button>

            <button
              onClick={() => postToVsCode({ type: 'openSettings' })}
              className="nav-btn"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f9fafb',
                padding: '6px 8px',
                textAlign: 'left',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              <span>⚙️</span> Einstellungen
            </button>

            <div style={{ marginTop: '12px', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
              <div style={{
                fontSize: '9px',
                textTransform: 'uppercase',
                color: '#9ca3af',
                letterSpacing: '0.05em',
                marginBottom: '6px',
                paddingLeft: '4px'
              }}>
                Aktionen & Verlauf
              </div>
              <div>
                <div
                  onClick={() => postToVsCode({ type: 'checkUpdates' })}
                  className="history-item"
                  style={{
                    fontSize: '11px',
                    color: '#9ca3af',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  🔄 GitHub Update prüfen
                </div>
              </div>
            </div>
          </div>

          <div style={{
            fontSize: '10px',
            color: '#9ca3af',
            textAlign: 'center',
            paddingTop: '6px',
            borderTop: '1px solid #1f2937'
          }}>
            {extName} v{extVersion}
          </div>
        </div>
      )}

      {/* Rechter Haupt-Chat-Bereich */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0b0f19',
        height: '100vh',
        boxSizing: 'border-box',
        minWidth: 0
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid #1f2937',
          fontSize: '12px',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#111827'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="toggle-sidebar-btn"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title="Sidebar umschalten"
              style={{
                background: 'transparent',
                border: '1px solid #1f2937',
                color: '#9ca3af',
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: '11px'
              }}
            >
              ☰
            </button>
            <span>Agentic Chat</span>
          </div>
          <span style={{ fontSize: '11px', color: '#f59e0b' }}>Bypass [ON]</span>
        </div>

        {/* Nachrichtenliste */}
        <div style={{
          flex: 1,
          padding: '14px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                maxWidth: '90%',
                lineHeight: 1.4,
                wordBreak: 'break-word',
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: msg.sender === 'user' ? '#1e293b' : '#111827',
                border: '1px solid #1f2937'
              }}
            >
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Eingabebereich */}
        <div style={{
          padding: '10px 14px',
          backgroundColor: '#111827',
          borderTop: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <textarea
            className="chat-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Was soll gebaut werden? (Ctrl+Enter)..."
            style={{
              width: '100%',
              background: '#0b0f19',
              border: '1px solid #1f2937',
              color: '#fff',
              padding: '8px',
              borderRadius: '6px',
              fontSize: '12px',
              resize: 'none',
              height: '48px',
              boxSizing: 'border-box',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: '#0b0f19',
                border: '1px solid #1f2937',
                color: '#f9fafb',
                padding: '4px 6px',
                borderRadius: '4px',
                fontSize: '11px'
              }}
            >
              <option value="gemini-3.7-flash">gemini-3.7-flash</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
            </select>
            <button
              className="send-btn"
              onClick={handleSendMessage}
              style={{
                background: '#06b6d4',
                color: '#0b0f19',
                border: 'none',
                padding: '6px 14px',
                fontWeight: 'bold',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              Senden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};