import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'backend', 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

interface Group {
  groupId: string;
  groupName?: string;
  groupType?: 'instagram-marketplace' | 'instagram' | 'telegram' | 'fraud-discussion' | 'developer-market';
  userId: string;
  addedAt: string;
  isActive: boolean;
}

interface GroupsData {
  groups: Record<string, Group>;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readGroupsData(): GroupsData {
  ensureDataDir();
  
  if (!fs.existsSync(GROUPS_FILE)) {
    return { groups: {} };
  }

  try {
    const fileContent = fs.readFileSync(GROUPS_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading groups data:', error);
    return { groups: {} };
  }
}

export function writeGroupsData(data: GroupsData): void {
  ensureDataDir();
  
  try {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing groups data:', error);
    throw error;
  }
}

export function getUserGroups(userId: string): Group[] {
  const data = readGroupsData();
  return Object.values(data.groups).filter(group => group.userId === userId);
}

export function addGroup(group: Group): void {
  const data = readGroupsData();
  data.groups[group.groupId] = {
    ...group,
    addedAt: new Date().toISOString(),
  };
  writeGroupsData(data);
}

export function removeGroup(groupId: string): void {
  const data = readGroupsData();
  delete data.groups[groupId];
  writeGroupsData(data);
}

export function updateGroup(groupId: string, updates: Partial<Group>): void {
  const data = readGroupsData();
  if (data.groups[groupId]) {
    data.groups[groupId] = {
      ...data.groups[groupId],
      ...updates,
    };
    writeGroupsData(data);
  }
}

