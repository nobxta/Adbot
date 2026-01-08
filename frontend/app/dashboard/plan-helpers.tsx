// Plan badge helpers for dashboard
import { Crown, Gem, Award, Star, Zap, Shield } from 'lucide-react';

export interface PlanBadgeConfig {
  icon: any;
  gradient: string;
  borderColor: string;
  textColor: string;
  bgColor: string;
}

export function getPlanBadge(planName: string | null, planType: string | null): PlanBadgeConfig {
  const name = (planName || '').toLowerCase();
  const type = (planType || '').toUpperCase();

  // Enterprise plans
  if (type === 'ENTERPRISE') {
    if (name.includes('elite')) {
      return {
        icon: Crown,
        gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
        borderColor: 'rgba(255, 215, 0, 0.5)',
        textColor: '#FFD700',
        bgColor: 'rgba(255, 215, 0, 0.1)',
      };
    }
    if (name.includes('pro')) {
      return {
        icon: Gem,
        gradient: 'linear-gradient(135deg, #C0C0C0 0%, #808080 100%)',
        borderColor: 'rgba(192, 192, 192, 0.5)',
        textColor: '#C0C0C0',
        bgColor: 'rgba(192, 192, 192, 0.1)',
      };
    }
    if (name.includes('basic')) {
      return {
        icon: Shield,
        gradient: 'linear-gradient(135deg, #4A90E2 0%, #357ABD 100%)',
        borderColor: 'rgba(74, 144, 226, 0.5)',
        textColor: '#4A90E2',
        bgColor: 'rgba(74, 144, 226, 0.1)',
      };
    }
  }

  // Starter plans
  if (type === 'STARTER') {
    if (name.includes('diamond')) {
      return {
        icon: Gem,
        gradient: 'linear-gradient(135deg, #B9F2FF 0%, #00D4FF 100%)',
        borderColor: 'rgba(185, 242, 255, 0.5)',
        textColor: '#00D4FF',
        bgColor: 'rgba(185, 242, 255, 0.1)',
      };
    }
    if (name.includes('premium')) {
      return {
        icon: Award,
        gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
        borderColor: 'rgba(255, 215, 0, 0.5)',
        textColor: '#FFD700',
        bgColor: 'rgba(255, 215, 0, 0.1)',
      };
    }
    if (name.includes('standard')) {
      return {
        icon: Star,
        gradient: 'linear-gradient(135deg, #C0C0C0 0%, #808080 100%)',
        borderColor: 'rgba(192, 192, 192, 0.5)',
        textColor: '#C0C0C0',
        bgColor: 'rgba(192, 192, 192, 0.1)',
      };
    }
    if (name.includes('basic') || name.includes('bronze')) {
      return {
        icon: Zap,
        gradient: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)',
        borderColor: 'rgba(205, 127, 50, 0.5)',
        textColor: '#CD7F32',
        bgColor: 'rgba(205, 127, 50, 0.1)',
      };
    }
  }

  // Default fallback
  return {
    icon: Shield,
    gradient: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    textColor: '#FFFFFF',
    bgColor: 'rgba(255, 255, 255, 0.05)',
  };
}

export function formatPlanName(planName: string | null, planType: string | null): string {
  if (planName) return planName;
  if (planType) {
    const type = planType.toUpperCase();
    return type === 'ENTERPRISE' ? 'Enterprise Plan' : 'Starter Plan';
  }
  return 'No Plan';
}

