import { ReactNode } from 'react';
import { User } from 'firebase/auth';
import { LogOut, User as UserIcon, Shield, Settings, HelpCircle, Bell } from 'lucide-react';
import { motion } from 'motion/react';

interface ProfileProps {
  user: User;
  onLogout: () => void;
}

export default function Profile({ user, onLogout }: ProfileProps) {
  return (
    <div className="space-y-6">
      <div className="bg-neon p-8 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
        <div className="border-4 border-ink p-1 bg-white mb-4">
          <img 
            src={user.photoURL || ''} 
            className="w-24 h-24 object-cover"
          />
        </div>
        <h2 className="text-3xl font-black text-ink tracking-tighter uppercase italic leading-none">{user.displayName}</h2>
        <p className="text-ink text-[10px] font-black uppercase tracking-widest mt-2 bg-white px-2 border-2 border-ink">{user.email}</p>
      </div>

      <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] divide-y-4 divide-ink">
        <ProfileItem icon={<Bell size={20} />} label="Notification" count={3} />
        <ProfileItem icon={<Shield size={20} />} label="Security" />
        <ProfileItem icon={<Settings size={20} />} label="Settings" />
        <ProfileItem icon={<HelpCircle size={20} />} label="Help & Feedback" />
      </div>

      <button 
        onClick={onLogout}
        className="w-full bg-ink text-neon p-5 border-4 border-ink font-black uppercase italic text-xl flex items-center justify-center gap-4 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
      >
        <LogOut size={24} />
        Logout / 退出
      </button>

      <div className="text-center text-[10px] font-black text-ink uppercase tracking-[0.4em] py-4 italic">
        FitGroup // ver_1.0.0
      </div>
    </div>
  );
}

function ProfileItem({ icon, label, count }: { icon: ReactNode, label: string, count?: number }) {
  return (
    <button className="w-full flex items-center justify-between p-5 hover:bg-neon transition-colors cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className="text-ink group-hover:scale-110 transition-transform">{icon}</div>
        <span className="font-black text-ink uppercase tracking-tighter text-lg">{label}</span>
      </div>
      {count ? (
        <span className="bg-ink text-white text-[10px] font-black px-2 py-0.5 border-2 border-ink">
          {count}
        </span >
      ) : (
        <div className="w-2 h-2 bg-ink" />
      )}
    </button>
  );
}

