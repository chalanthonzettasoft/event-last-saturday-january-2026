import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, X, HelpCircle, AlertTriangle } from 'lucide-react';

interface ModalOptions {
  title?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  placeholder?: string;
}

interface ModalContextType {
  showAlert: (message: string, options?: ModalOptions) => Promise<void>;
  showConfirm: (message: string, options?: ModalOptions) => Promise<boolean>;
  showInput: (message: string, options?: ModalOptions) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalState {
  isOpen: boolean;
  message: string;
  options: ModalOptions;
  resolve?: (value: any) => void;
  isConfirm: boolean;
  isInput: boolean;
  inputValue: string;
}

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    message: '',
    options: {},
    isConfirm: false,
    isInput: false,
    inputValue: ''
  });

  const resolveRef = useRef<((value: any) => void) | null>(null);

  const showAlert = (message: string, options: ModalOptions = {}) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => resolve();
      setModal({
        isOpen: true,
        message,
        options,
        isConfirm: false,
        isInput: false,
        inputValue: ''
      });
    });
  };

  const showConfirm = (message: string, options: ModalOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setModal({
        isOpen: true,
        message,
        options,
        isConfirm: true,
        isInput: false,
        inputValue: ''
      });
    });
  };

  const showInput = (message: string, options: ModalOptions = {}) => {
      return new Promise<string | null>((resolve) => {
        resolveRef.current = resolve;
        setModal({
          isOpen: true,
          message,
          options,
          isConfirm: true,
          isInput: true,
          inputValue: options.defaultValue || ''
        });
      });
    };

  const handleClose = (result: any) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
  };

  const getIcon = (type?: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="text-green-500" size={32} />;
      case 'error': return <AlertCircle className="text-rose-500" size={32} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={32} />;
      default: return <Info className="text-indigo-500" size={32} />;
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showInput }}>
      {children}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !modal.isConfirm && handleClose(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative z-10 animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 p-3 bg-slate-50 rounded-full">
                {getIcon(modal.options.type)}
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                {modal.options.title || (modal.isConfirm ? (modal.isInput ? 'Enter Value' : 'Confirm Action') : 'Notification')}
              </h3>
              
              <p className="text-slate-600 mb-6 leading-relaxed">
                {modal.message}
              </p>

              {modal.isInput && (
                  <input
                    type="text"
                    value={modal.inputValue}
                    onChange={(e) => setModal(prev => ({ ...prev, inputValue: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2 mb-6 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder={modal.options.placeholder}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleClose(modal.inputValue);
                    }}
                  />
              )}

              <div className="flex gap-3 w-full">
                {modal.isConfirm && (
                   <button
                    onClick={() => handleClose(modal.isInput ? null : false)}
                    className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    {modal.options.cancelText || 'Cancel'}
                  </button>
                )}
                <button
                  onClick={() => handleClose(modal.isInput ? modal.inputValue : true)}
                  className={`flex-1 py-3 px-4 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 ${
                    modal.options.type === 'error' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' :
                    modal.options.type === 'success' ? 'bg-green-600 hover:bg-green-700 shadow-green-200' :
                    modal.options.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' :
                    'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                  }`}
                >
                  {modal.options.confirmText || 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
