/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Tournament, Team, Group, Match, AuditLog, TournamentSettings, SeedType, GroupStanding, ThirdPlaceStanding, EventData } from './types';
import { generateRoundRobinMatches, calculateGroupStandings, calculateBestThirdPlaces, generateKnockoutMatchesSchema, balanceMatchesRestTime } from './utils/tournamentEngine';
import { supabase, checkSupabaseConnection } from './supabaseClient';

interface AppState {
  tournament: Tournament;
  teams: Record<string, Team>;
  groups: Record<string, Group>;
  matches: Match[];
  logs: AuditLog[];
  darkMode: boolean;
  selectedTab: string;
  activeGroupId: string | null;
  advanceSelectionMode: 'auto' | 'manual';
  manualQualifiedTeamIds: string[];
  events: Record<string, EventData>;
  currentEventId: string;
  isAdmin: boolean;
  setAdminStatus: (status: boolean) => void;
  supabaseConnected: boolean | null; // null = checking, true = online, false = using offline/cached data
  supabaseSyncError: string | null;

  // Actions
  checkConnection: () => Promise<boolean>;
  updateTournament: (t: Partial<Tournament>) => void;
  updateSettings: (s: Partial<TournamentSettings>) => void;
  
  // Event actions
  addEvent: (name: string) => void;
  deleteEvent: (id: string) => void;
  renameEvent: (id: string, newName: string) => void;
  setCurrentEvent: (id: string) => void;
  
  // Teams actions
  addTeam: (name: string, seed: SeedType) => { success: boolean; message: string };
  deleteTeam: (id: string) => void;
  updateTeam: (id: string, name: string, seed: SeedType) => { success: boolean; message: string };
  importTeams: (csvContent: string) => { success: boolean; addedCount: number; errors: string[] };

  // Group actions
  setupGroups: (numGroups: number) => void;
  autoGroupTeams: (method: 'random' | 'seed', numGroups: number) => void;
  moveTeamToGroup: (teamId: string, targetGroupId: string | null) => void;
  clearAllGroups: () => void;

  // Match Actions
  generateMatchesForGroup: (groupId: string) => void;
  clearMatchesForGroup: (groupId: string) => void;
  updateMatchScore: (matchId: string, scoreA: number | null, scoreB: number | null) => void;
  resetMatchScore: (matchId: string) => void;
  generateAllSchedules: () => void;

  // Knockout Actions
  generateKnockoutBracket: (size: 4 | 8 | 16 | 32) => void;
  updateKnockoutScore: (matchId: string, scoreA: number | null, scoreB: number | null) => void;
  updateKnockoutParticipant: (matchId: string, slot: 'A' | 'B', teamNameOrId: string) => void;
  clearKnockout: () => void;

  // UI Actions
  setDarkMode: (dark: boolean) => void;
  setSelectedTab: (tab: string) => void;
  setActiveGroupId: (id: string | null) => void;
  setAdvanceSelectionMode: (mode: 'auto' | 'manual') => void;
  toggleManualQualifiedTeam: (teamId: string) => void;
  clearManualQualifiedTeams: () => void;
  
  // System actions
  addLog: (action: string, details: string) => void;
  clearLogs: () => void;
  resetAll: () => void;
  initSupabase: () => Promise<void>;
}

const DEFAULT_SETTINGS: TournamentSettings = {
  winPoint: 2,
  lossPoint: 1,
  maxScore: 15,
  capScore: 17,
  advanceCount: 2,
};

const DEFAULT_TOURNAMENT: Tournament = {
  id: 't-1',
  name: 'Giải Vô Địch Pickleball NGÂN SƠN 2026 lần 1',
  organization: 'CLB Pickleball NGÂN SƠN',
  location: 'Doanh Thơ',
  date: '2026-06-30',
  settings: DEFAULT_SETTINGS,
};

const syncStateToSupabase = async (state: AppState, originalSet?: any) => {
  const errors: string[] = [];
  try {
    const tournamentId = state.tournament.id || 't-1';
    
    // 1. Sync Tournament Metadata
    const { error: tErr } = await supabase.from('tournament').upsert({
      id: tournamentId,
      name: state.tournament.name,
      organization: state.tournament.organization,
      location: state.tournament.location,
      date: state.tournament.date,
      settings: state.tournament.settings,
      current_event_id: state.currentEventId
    });
    if (tErr) {
      errors.push(`Giải đấu: ${tErr.message}`);
      console.error('Supabase Sync ERROR (tournament):', tErr.message, tErr.details);
    }

    // 2. Sync Events list
    const eventIds = Object.keys(state.events || {});
    for (const evtId of eventIds) {
      const evt = state.events[evtId];
      if (evt) {
        const { error: eErr } = await supabase.from('events').upsert({
          id: evt.id,
          name: evt.name,
          settings: evt.settings || state.tournament.settings || DEFAULT_SETTINGS,
          active_group_id: evt.activeGroupId,
          advance_selection_mode: evt.advanceSelectionMode,
          manual_qualified_team_ids: evt.manualQualifiedTeamIds
        });
        if (eErr) {
          errors.push(`Nội dung "${evt.name}": ${eErr.message}`);
          console.error(`Supabase Sync ERROR (events table, evtId ${evt.id}):`, eErr.message, eErr.details);
        }
      }
    }

    // Clean up deleted events in Supabase to keep db clean
    const { data: dbEvents, error: dbEvtFetchErr } = await supabase.from('events').select('id');
    if (dbEvtFetchErr) {
      console.error('Supabase Sync ERROR (fetch events for cleanup):', dbEvtFetchErr.message);
    } else if (dbEvents) {
      const dbEventIds = dbEvents.map(e => e.id);
      const deletedIds = dbEventIds.filter(id => !eventIds.includes(id));
      for (const delId of deletedIds) {
        try {
          await supabase.from('events').delete().eq('id', delId);
          await supabase.from('teams').delete().eq('event_id', delId);
          await supabase.from('groups').delete().eq('event_id', delId);
          await supabase.from('matches').delete().eq('event_id', delId);
        } catch (fallErr: any) {
          console.error(`Supabase Sync EXCEPTION (event delete cascade fallback, ID ${delId}):`, fallErr.message || fallErr);
        }
      }
    }

    // 3. Sync Teams for ALL events (saving all online data fields simultaneously)
    const allTeams: any[] = [];
    const teamIdsInState: string[] = [];
    
    Object.keys(state.events || {}).forEach(evtId => {
      const evt = state.events[evtId];
      if (evt && evt.teams) {
        Object.values(evt.teams).forEach(t => {
          allTeams.push({
            id: t.id,
            name: t.name,
            group_id: t.groupId || null,
            seed: t.seed || 'none',
            event_id: evtId
          });
          teamIdsInState.push(t.id);
        });
      }
    });

    if (allTeams.length > 0) {
      const { error: teamsErr } = await supabase.from('teams').upsert(allTeams);
      if (teamsErr) {
        errors.push(`Đội bóng (upsert): ${teamsErr.message}`);
        console.error('Supabase Sync ERROR (teams upsert):', teamsErr.message, teamsErr.details);
      }
    }
    
    try {
      if (teamIdsInState.length > 0) {
        const { error: delTeamsErr } = await supabase.from('teams').delete().not('id', 'in', `(${teamIdsInState.map(id => `'${id}'`).join(',')})`);
        if (delTeamsErr) {
          console.error('Supabase Sync ERROR (teams prune):', delTeamsErr.message, delTeamsErr.details);
        }
      } else {
        const { error: delTeamsErr } = await supabase.from('teams').delete();
        if (delTeamsErr) {
          console.error('Supabase Sync ERROR (teams clear):', delTeamsErr.message);
        }
      }
    } catch (pruneTeamsErr: any) {
      console.error('Supabase Sync EXCEPTION (teams prune):', pruneTeamsErr.message || pruneTeamsErr);
    }

    // 4. Sync Groups for ALL events
    const allGroups: any[] = [];
    const groupIdsInState: string[] = [];
    
    Object.keys(state.events || {}).forEach(evtId => {
      const evt = state.events[evtId];
      if (evt && evt.groups) {
        Object.values(evt.groups).forEach(g => {
          allGroups.push({
            id: g.id,
            name: g.name,
            team_ids: g.teamIds || [],
            event_id: evtId
          });
          groupIdsInState.push(g.id);
        });
      }
    });

    if (allGroups.length > 0) {
      const { error: groupsErr } = await supabase.from('groups').upsert(allGroups);
      if (groupsErr) {
        errors.push(`Bảng đấu (upsert): ${groupsErr.message}`);
        console.error('Supabase Sync ERROR (groups upsert):', groupsErr.message, groupsErr.details);
      }
    }
    
    try {
      if (groupIdsInState.length > 0) {
        const { error: delGroupsErr } = await supabase.from('groups').delete().not('id', 'in', `(${groupIdsInState.map(id => `'${id}'`).join(',')})`);
        if (delGroupsErr) {
          console.error('Supabase Sync ERROR (groups prune):', delGroupsErr.message, delGroupsErr.details);
        }
      } else {
        await supabase.from('groups').delete();
      }
    } catch (pruneGroupsErr: any) {
      console.error('Supabase Sync EXCEPTION (groups prune):', pruneGroupsErr.message || pruneGroupsErr);
    }

    // 5. Sync Matches for ALL events
    const allMatches: any[] = [];
    const matchIdsInState: string[] = [];
    
    Object.keys(state.events || {}).forEach(evtId => {
      const evt = state.events[evtId];
      if (evt && evt.matches) {
        evt.matches.forEach(m => {
          allMatches.push({
            id: m.id,
            group_id: m.groupId || null, // Allow nullable group_id for Knockout matches
            team_a_id: m.teamAId || null, // Allow nullable team_a_id for empty slots
            team_b_id: m.teamBId || null, // Allow nullable team_b_id for empty slots
            score_a: m.scoreA !== undefined && m.scoreA !== null ? m.scoreA : null,
            score_b: m.scoreB !== undefined && m.scoreB !== null ? m.scoreB : null,
            winner_id: m.winnerId || null,
            status: m.status || 'pending',
            round: m.round,
            knockout_round_name: m.knockoutRoundName || null,
            knockout_match_id: m.knockoutMatchId || null,
            next_match_id: m.nextMatchId || null,
            next_match_slot: m.nextMatchSlot || null,
            event_id: evtId
          });
          matchIdsInState.push(m.id);
        });
      }
    });

    if (allMatches.length > 0) {
      const { error: matchesErr } = await supabase.from('matches').upsert(allMatches);
      if (matchesErr) {
        errors.push(`Trận đấu (upsert): ${matchesErr.message}`);
        console.error('Supabase Sync ERROR (matches upsert):', matchesErr.message, matchesErr.details);
      }
    }
    
    try {
      if (matchIdsInState.length > 0) {
        const { error: delMatchesErr } = await supabase.from('matches').delete().not('id', 'in', `(${matchIdsInState.map(id => `'${id}'`).join(',')})`);
        if (delMatchesErr) {
          console.error('Supabase Sync ERROR (matches prune):', delMatchesErr.message, delMatchesErr.details);
        }
      } else {
        await supabase.from('matches').delete();
      }
    } catch (pruneMatchesErr: any) {
      console.error('Supabase Sync EXCEPTION (matches prune):', pruneMatchesErr.message || pruneMatchesErr);
    }

  } catch (err: any) {
    errors.push(`Ngoại lệ hệ thống: ${err.message || err}`);
    console.error('Lỗi ngoại lệ lưu đồng bộ Supabase:', err);
  }

  // Update error message state so the user is aware of Sync outcome
  if (originalSet) {
    if (errors.length > 0) {
      originalSet({ supabaseSyncError: errors.join('; ') });
    } else {
      originalSet({ supabaseSyncError: null });
    }
  }
};

export const useTournamentStore = create<AppState>()(
  persist(
    (originalSet, get) => {
      const set: typeof originalSet = (nextStateOrFn, replace) => {
        originalSet((state) => {
          const nextState = typeof nextStateOrFn === 'function' ? (nextStateOrFn as Function)(state) : nextStateOrFn;
          const mergedState = { ...state, ...nextState };
          
          const activeId = mergedState.currentEventId || 'event-default';
          const events = { ...mergedState.events };
          
          if (!events[activeId]) {
            events[activeId] = {
              id: activeId,
              name: mergedState.currentEventId === 'event-default' ? 'Đôi Nam Chuyên Nghiệp' : 'Nội dung mới',
              teams: {},
              groups: {},
              matches: [],
              settings: mergedState.tournament?.settings || DEFAULT_SETTINGS,
              activeGroupId: null,
              advanceSelectionMode: 'auto',
              manualQualifiedTeamIds: []
            };
          }
          
          // Self-migration check
          if (
            Object.keys(mergedState.teams || {}).length > 0 &&
            Object.keys(events['event-default']?.teams || {}).length === 0
          ) {
            events['event-default'] = {
              id: 'event-default',
              name: 'Đôi Nam Chuyên Nghiệp',
              teams: mergedState.teams,
              groups: mergedState.groups,
              matches: mergedState.matches,
              activeGroupId: mergedState.activeGroupId,
              advanceSelectionMode: mergedState.advanceSelectionMode || 'auto',
              manualQualifiedTeamIds: mergedState.manualQualifiedTeamIds || [],
              settings: mergedState.tournament?.settings || DEFAULT_SETTINGS,
            };
          }

          const hasFlatChanges = 
            'teams' in nextState ||
            'groups' in nextState ||
            'matches' in nextState ||
            'activeGroupId' in nextState ||
            'advanceSelectionMode' in nextState ||
            'manualQualifiedTeamIds' in nextState;

          const isTournamentSettingsChanged = nextState.tournament && nextState.tournament.settings;

          if (hasFlatChanges || isTournamentSettingsChanged) {
            events[activeId] = {
              ...events[activeId],
              teams: mergedState.teams || {},
              groups: mergedState.groups || {},
              matches: mergedState.matches || [],
              activeGroupId: mergedState.activeGroupId,
              advanceSelectionMode: mergedState.advanceSelectionMode || 'auto',
              manualQualifiedTeamIds: mergedState.manualQualifiedTeamIds || [],
              settings: mergedState.tournament?.settings || events[activeId].settings || DEFAULT_SETTINGS,
            };
          }

          if ('currentEventId' in nextState) {
            const newActiveId = nextState.currentEventId;
            if (events[newActiveId]) {
              const targetEvent = events[newActiveId];
              return {
                ...mergedState,
                events,
                teams: targetEvent.teams || {},
                groups: targetEvent.groups || {},
                matches: targetEvent.matches || [],
                activeGroupId: targetEvent.activeGroupId || null,
                advanceSelectionMode: targetEvent.advanceSelectionMode || 'auto',
                manualQualifiedTeamIds: targetEvent.manualQualifiedTeamIds || [],
                tournament: {
                  ...mergedState.tournament,
                  settings: targetEvent.settings || mergedState.tournament?.settings || DEFAULT_SETTINGS
                }
              };
            }
          }

          return {
            ...mergedState,
            events,
          };
        }, replace);

        // Sync with Supabase on modifications if admin holds active session
        const currentState = get();
        if (currentState.isAdmin) {
          syncStateToSupabase(currentState, originalSet);
        }
      };

      const getTimestampStr = () => {
        const d = new Date();
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN');
      };

      const logToStore = (action: string, details: string) => {
        const newLog: AuditLog = {
          timestamp: getTimestampStr(),
          action,
          details,
        };
        originalSet((state) => ({ logs: [newLog, ...state.logs].slice(0, 500) })); // Lưu tối đa 500 logs
        
        // Save audit activity stream concurrently if Admin is actively mutating data
        const currentState = get();
        if (currentState.isAdmin) {
          supabase.from('audit_logs').insert([{
            timestamp: newLog.timestamp,
            action: newLog.action,
            details: newLog.details
          }]).then();
        }
      };

      return {
        tournament: DEFAULT_TOURNAMENT,
        teams: {},
        groups: {},
        matches: [],
        logs: [],
        darkMode: false,
        selectedTab: 'dashboard',
        activeGroupId: null,
        advanceSelectionMode: 'auto',
        manualQualifiedTeamIds: [],
        events: {
          'event-default': {
            id: 'event-default',
            name: 'Đôi Nam Chuyên Nghiệp',
            teams: {},
            groups: {},
            matches: [],
            settings: DEFAULT_SETTINGS,
            activeGroupId: null,
            advanceSelectionMode: 'auto',
            manualQualifiedTeamIds: []
          }
        },
        currentEventId: 'event-default',
        isAdmin: typeof window !== 'undefined' ? (localStorage.getItem('pickleball_admin_auth') === 'true') : false,
        setAdminStatus: (status: boolean) => {
          if (typeof window !== 'undefined') {
            if (status) {
              localStorage.setItem('pickleball_admin_auth', 'true');
            } else {
              localStorage.removeItem('pickleball_admin_auth');
            }
          }
          set({ isAdmin: status });
        },
        supabaseConnected: null,
        supabaseSyncError: null,
        checkConnection: async () => {
          const connected = await checkSupabaseConnection();
          set({ supabaseConnected: connected });
          return connected;
        },

        updateTournament: (t) => {
          if (!get().isAdmin) return;
          set((state) => {
            const updated = { ...state.tournament, ...t };
            return { tournament: updated };
          });
          logToStore('Cấu hình Giải', `Cập nhật thông tin tổng quan của giải đấu.`);
        },

        updateSettings: (s) => {
          if (!get().isAdmin) return;
          set((state) => {
            const updatedSettings = { ...state.tournament.settings, ...s };
            const updated = { ...state.tournament, settings: updatedSettings };
            return { tournament: updated };
          });
          logToStore('Cấu hình Điểm', `Thay đổi cài đặt điểm chạm: ${JSON.stringify(s)}`);
        },

        addEvent: (name) => {
          if (!get().isAdmin) return;
          const id = `event-${Math.random().toString(36).substring(2, 9)}`;
          const trimmedName = name.trim() || 'Nội dung mới';
          set((state) => {
            const nextEvents = { ...state.events };
            nextEvents[id] = {
              id,
              name: trimmedName,
              teams: {},
              groups: {},
              matches: [],
              settings: state.tournament?.settings || DEFAULT_SETTINGS,
              activeGroupId: null,
              advanceSelectionMode: 'auto',
              manualQualifiedTeamIds: []
            };
            return {
              events: nextEvents,
              currentEventId: id
            };
          });
          logToStore('Nội Dung', `Thêm nội dung thi đấu mới: "${trimmedName}"`);
        },

        deleteEvent: (id) => {
          if (!get().isAdmin) return;
          const event = get().events[id];
          if (!event) return;
          
          const eventKeys = Object.keys(get().events);
          if (eventKeys.length <= 1) {
            return;
          }

          set((state) => {
            const nextEvents = { ...state.events };
            delete nextEvents[id];
            
            let nextActiveId = state.currentEventId;
            if (state.currentEventId === id) {
              nextActiveId = Object.keys(nextEvents)[0];
            }
            
            return {
              events: nextEvents,
              currentEventId: nextActiveId
            };
          });
          logToStore('Nội Dung', `Xóa nội dung thi đấu: "${event.name}"`);
        },

        renameEvent: (id, newName) => {
          if (!get().isAdmin) return;
          const trimmed = newName.trim();
          if (!trimmed) return;
          const oldName = get().events[id]?.name || id;

          set((state) => {
            const nextEvents = { ...state.events };
            if (nextEvents[id]) {
              nextEvents[id] = {
                ...nextEvents[id],
                name: trimmed
              };
            }
            return { events: nextEvents };
          });
          logToStore('Nội Dung', `Đổi tên nội dung thi đấu từ "${oldName}" thành "${trimmed}"`);
        },

        setCurrentEvent: (id) => {
          if (!get().events[id]) return;
          set({ currentEventId: id });
          logToStore('Hệ Thống', `Chuyển sang điều hành nội dung: "${get().events[id]?.name}"`);
        },

        addTeam: (name, seed) => {
          if (!get().isAdmin) {
            return { success: false, message: 'Yêu cầu quyền Admin để thêm đội.' };
          }
          const trimmedName = name.trim();
          if (!trimmedName) {
            return { success: false, message: 'Tên đội không được rỗng.' };
          }

          const existing = Object.values(get().teams).find(
            (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
          );
          if (existing) {
            return { success: false, message: `Đội "${trimmedName}" đã tồn tại trên hệ thống.` };
          }

          const id = `team-${Math.random().toString(36).substring(2, 9)}`;
          const newTeam: Team = {
            id,
            name: trimmedName,
            groupId: null,
            seed,
          };

          set((state) => ({
            teams: { ...state.teams, [id]: newTeam },
          }));

          logToStore('Quản lý Đội', `Thêm đội mới: "${trimmedName}" (Hạt giống: ${seed === 'none' ? 'Không' : seed})`);
          return { success: true, message: 'Thêm đội thành công.' };
        },

        deleteTeam: (id) => {
          if (!get().isAdmin) return;
          const team = get().teams[id];
          if (!team) return;

          const teamGroupId = team.groupId;

          set((state) => {
            // Xóa đội khỏi danh sách map
            const nextTeams = { ...state.teams };
            delete nextTeams[id];

            // Xóa đội khỏi bảng đấu thuộc về (nếu có)
            const nextGroups = { ...state.groups };
            if (teamGroupId && nextGroups[teamGroupId]) {
              nextGroups[teamGroupId] = {
                ...nextGroups[teamGroupId],
                teamIds: nextGroups[teamGroupId].teamIds.filter((tId) => tId !== id),
              };
            }

            // Xóa các trận đấu có sự tham gia của đội này
            const nextMatches = state.matches.filter(
              (m) => m.teamAId !== id && m.teamBId !== id
            );

            return {
              teams: nextTeams,
              groups: nextGroups,
              matches: nextMatches,
            };
          });

          logToStore('Quản lý Đội', `Xóa đội: "${team.name}". Tự động gỡ khỏi bảng đấu & hủy các trận đấu có liên quan.`);
        },

        updateTeam: (id, name, seed) => {
          if (!get().isAdmin) {
            return { success: false, message: 'Yêu cầu quyền Admin để sửa thông tin đội.' };
          }
          const trimmedName = name.trim();
          if (!trimmedName) {
            return { success: false, message: 'Tên đội không được rỗng.' };
          }

          const existing = Object.values(get().teams).find(
            (t) => t.id !== id && t.name.toLowerCase() === trimmedName.toLowerCase()
          );
          if (existing) {
            return { success: false, message: `Tên đội "${trimmedName}" bị trùng với đội đã có.` };
          }

          const oldTeam = get().teams[id];
          if (!oldTeam) return { success: false, message: 'Không tìm thấy thông tin đội.' };

          set((state) => {
            const updated = { ...state.teams[id], name: trimmedName, seed };
            return {
              teams: { ...state.teams, [id]: updated },
            };
          });

          logToStore('Quản lý Đội', `Sửa thông tin đội: "${oldTeam.name}" -> "${trimmedName}" (Hạt giống: ${seed})`);
          return { success: true, message: 'Sửa thông tin đội thành công.' };
        },

        importTeams: (csvContent) => {
          if (!get().isAdmin) {
            return { success: false, addedCount: 0, errors: ['Yêu cầu quyền Admin để nhập danh sách từ file.'] };
          }
          if (!csvContent.trim()) {
            return { success: false, addedCount: 0, errors: ['Nội dung file trống.'] };
          }

          const lines = csvContent.split(/\r?\n/);
          let addedCount = 0;
          const errors: string[] = [];
          const currentTeams = Object.values(get().teams);

          set((state) => {
            const nextTeams = { ...state.teams };

            lines.forEach((line, idx) => {
              const cleaned = line.trim();
              if (!cleaned || idx === 0 && (cleaned.toLowerCase().includes('tên') || cleaned.toLowerCase().includes('name') || cleaned.toLowerCase().includes('stt'))) {
                // Bỏ qua dòng tiêu đề hoặc dòng rỗng
                return;
              }

              // Định dạng dòng: "STT,Tên đội,Hạt giống" hoặc chỉ có "Tên đội" hoặc phân tách bằng tab/phẩy
              let parts = cleaned.split(/,|	/);
              let teamName = '';
              let seedStr: SeedType = 'none';

              if (parts.length === 1) {
                teamName = parts[0].trim();
              } else if (parts.length === 2) {
                // Kiểm tra xem cột đầu là STT số không
                if (!isNaN(Number(parts[0].trim()))) {
                  teamName = parts[1].trim();
                } else {
                  teamName = parts[0].trim();
                  const potentialSeed = parts[1].trim();
                  if (['1', '2', '3', '4'].includes(potentialSeed)) {
                    seedStr = potentialSeed as SeedType;
                  }
                }
              } else if (parts.length >= 3) {
                teamName = parts[1].trim();
                const potentialSeed = parts[2].trim();
                if (['1', '2', '3', '4'].includes(potentialSeed)) {
                  seedStr = potentialSeed as SeedType;
                }
              }

              // Làm sạch dấu ngoặc kép bọc quanh tên đội
              teamName = teamName.replace(/^["']|["']$/g, '').trim();

              if (!teamName) return;

              const isDup = Object.values(nextTeams).some(
                (t) => t.name.toLowerCase() === teamName.toLowerCase()
              );

              if (isDup) {
                errors.push(`Dòng ${idx + 1}: Trùng tên đội "${teamName}" nên bỏ qua.`);
                return;
              }

              const id = `team-${Math.random().toString(36).substring(2, 9)}`;
              nextTeams[id] = {
                id,
                name: teamName,
                groupId: null,
                seed: seedStr,
              };
              addedCount++;
            });

            return { teams: nextTeams };
          });

          if (addedCount > 0) {
            logToStore('Nhập Đội', `Nhập thành công ${addedCount} đội từ file Excel/CSV mẫu.`);
          }
          return { success: true, addedCount, errors };
        },

        setupGroups: (numGroups) => {
          if (!get().isAdmin) return;
          if (numGroups < 1 || numGroups > 12) return;

          set((state) => {
            const nextGroups: Record<string, Group> = {};
            const teamIds = Object.keys(state.teams);
            
            // Xóa sạch thông tin bảng đấu cũ của các đội
            const nextTeams = { ...state.teams };
            teamIds.forEach((tId) => {
              nextTeams[tId].groupId = null;
            });

            // Tạo các bảng mới tinh
            for (let i = 0; i < numGroups; i++) {
              const gId = `group-${i + 1}`;
              const gName = `Bảng ${String.fromCharCode(65 + i)}`; // Bảng A, B, C...
              nextGroups[gId] = {
                id: gId,
                name: gName,
                teamIds: [],
              };
            }

            // Xóa tất cả các trận đấu vòng bảng cũ
            const nextMatches = state.matches.filter((m) => m.groupId === 'knockout');

            return {
              groups: nextGroups,
              teams: nextTeams,
              matches: nextMatches,
              activeGroupId: Object.keys(nextGroups)[0] || null,
            };
          });

          logToStore('Phân Bảng', `Tạo ${numGroups} bảng đấu trống mới (Bảng A, B...). Đã đặt lại lịch thi đấu vòng bảng.`);
        },

        autoGroupTeams: (method, numGroups) => {
          if (!get().isAdmin) return;
          if (numGroups < 1 || numGroups > 12) return;
          const allTeams = Object.values(get().teams);
          if (allTeams.length === 0) return;

          // Khởi tạo bảng rỗng
          const groupList: Group[] = Array.from({ length: numGroups }, (_, idx) => ({
            id: `group-${idx + 1}`,
            name: `Bảng ${String.fromCharCode(65 + idx)}`,
            teamIds: [],
          }));

          // Sắp xếp đội
          let targetTeams = [...allTeams];

          if (method === 'random') {
            // Trộn ngẫu nhiên
            targetTeams.sort(() => Math.random() - 0.5);
            targetTeams.forEach((team, index) => {
              const grpIdx = index % numGroups;
              groupList[grpIdx].teamIds.push(team.id);
            });
          } else {
            // Phân bổ theo hạt giống chuyên nghiệp
            const seed1 = targetTeams.filter((t) => t.seed === '1').sort(() => Math.random() - 0.5);
            const seed2 = targetTeams.filter((t) => t.seed === '2').sort(() => Math.random() - 0.5);
            const seed3 = targetTeams.filter((t) => t.seed === '3').sort(() => Math.random() - 0.5);
            const seed4 = targetTeams.filter((t) => t.seed === '4').sort(() => Math.random() - 0.5);
            const noSeed = targetTeams.filter((t) => t.seed === 'none').sort(() => Math.random() - 0.5);

            let pointer = 0;
            const distribute = (list: Team[]) => {
              list.forEach((team) => {
                groupList[pointer].teamIds.push(team.id);
                pointer = (pointer + 1) % numGroups;
              });
            };

            distribute(seed1);
            distribute(seed2);
            distribute(seed3);
            distribute(seed4);
            distribute(noSeed);
          }

          set((state) => {
            const nextGroups: Record<string, Group> = {};
            const nextTeams = { ...state.teams };

            groupList.forEach((g) => {
              nextGroups[g.id] = g;
              g.teamIds.forEach((tId) => {
                if (nextTeams[tId]) {
                  nextTeams[tId].groupId = g.id;
                }
              });
            });

            // Đặt lại các trận đấu vòng bảng cũ
            const nextMatches = state.matches.filter((m) => m.groupId === 'knockout');

            return {
              groups: nextGroups,
              teams: nextTeams,
              matches: nextMatches,
              activeGroupId: groupList[0].id,
            };
          });

          logToStore('Chia Bảng', `Tự động phân bổ ${allTeams.length} đội vào ${numGroups} bảng đấu theo thể thức [${method === 'random' ? 'Ngẫu nhiên' : 'Hạt giống chuyên nghiệp UEFA'}].`);
        },

        moveTeamToGroup: (teamId, targetGroupId) => {
          if (!get().isAdmin) return;
          const team = get().teams[teamId];
          if (!team) return;

          const sourceGroupId = team.groupId;
          if (sourceGroupId === targetGroupId) return;

          set((state) => {
            const nextTeams = { ...state.teams };
            nextTeams[teamId] = { ...nextTeams[teamId], groupId: targetGroupId };

            const nextGroups = { ...state.groups };

            // Gỡ khỏi bảng nguồn
            if (sourceGroupId && nextGroups[sourceGroupId]) {
              nextGroups[sourceGroupId] = {
                ...nextGroups[sourceGroupId],
                teamIds: nextGroups[sourceGroupId].teamIds.filter((id) => id !== teamId),
              };
            }

            // Thêm vào bảng đích
            if (targetGroupId && nextGroups[targetGroupId]) {
              nextGroups[targetGroupId] = {
                ...nextGroups[targetGroupId],
                teamIds: [...nextGroups[targetGroupId].teamIds, teamId],
              };
            }

            // ĐỒNG BỘ DỮ LIỆU: Khi chuyển đội, toàn bộ lịch và kết quả đấu của các bảng liên quan phải được reset
            // để tránh dữ liệu rác, đảm bảo tính tái tính toán chuẩn.
            const nextMatches = state.matches.filter(
              (m) => m.groupId !== sourceGroupId && m.groupId !== targetGroupId
            );

            return {
              teams: nextTeams,
              groups: nextGroups,
              matches: nextMatches,
            };
          });

          const srcLabel = sourceGroupId ? get().groups[sourceGroupId]?.name : 'Không bảng';
          const destLabel = targetGroupId ? get().groups[targetGroupId]?.name : 'Không bảng';
          logToStore(
            'Chuyển Đội',
            `Kéo thả chuyển đội "${team.name}" từ [${srcLabel}] sang [${destLabel}]. Lịch thi đấu vòng tròn của 2 bảng này đã tự động được dọn dẹp để tái tính toán.`
          );
        },

        clearAllGroups: () => {
          if (!get().isAdmin) return;
          set((state) => {
            const nextGroups: Record<string, Group> = {};
            const nextTeams = { ...state.teams };
            
            Object.keys(nextTeams).forEach((tId) => {
              nextTeams[tId].groupId = null;
            });

            // Xóa lịch bảng, giữ lại knockout nếu có
            const nextMatches = state.matches.filter((m) => m.groupId === 'knockout');

            return {
              groups: nextGroups,
              teams: nextTeams,
              matches: nextMatches,
              activeGroupId: null,
            };
          });
          logToStore('Xóa Bảng', 'Giải tán toàn bộ các bảng đấu cấu hình.');
        },

        generateMatchesForGroup: (groupId) => {
          if (!get().isAdmin) return;
          const group = get().groups[groupId];
          if (!group || group.teamIds.length === 0) return;

          const settings = get().tournament.settings;
          const generated = generateRoundRobinMatches(groupId, group.teamIds, settings);

          set((state) => {
            // Lọc bỏ trận đấu cũ của bảng này
            const otherMatches = state.matches.filter((m) => m.groupId !== groupId);
            const knockoutMatches = otherMatches.filter((m) => m.groupId === 'knockout');
            const otherGroupMatches = otherMatches.filter((m) => m.groupId !== 'knockout');
            
            // Sơ đồ sắp xếp toàn bộ trận đấu vòng bảng tối ưu khoảng nghỉ
            const balancedAllGroupMatches = balanceMatchesRestTime([...otherGroupMatches, ...generated]);

            return {
              matches: [...balancedAllGroupMatches, ...knockoutMatches],
            };
          });

          logToStore('Lập Lịch', `Khởi tạo lịch đấu vòng tròn cho [${group.name}] gồm ${generated.length} trận đấu.`);
        },

        clearMatchesForGroup: (groupId) => {
          if (!get().isAdmin) return;
          const group = get().groups[groupId];
          set((state) => ({
            matches: state.matches.filter((m) => m.groupId !== groupId),
          }));
          if (group) {
            logToStore('Dọn Lịch', `Hủy toàn bộ lịch thi đấu và điểm số của bảng [${group.name}].`);
          }
        },

        updateMatchScore: (matchId, scoreA, scoreB) => {
          if (!get().isAdmin) return;
          set((state) => {
            const matchesCopy = state.matches.map((m) => {
              if (m.id !== matchId) return m;

              if (scoreA === null || scoreB === null) {
                return { ...m, scoreA: null, scoreB: null, winnerId: null, status: 'pending' as const };
              }

              // Xác định người thắng dựa trên ai điểm cao hơn
              let winnerId: string | null = null;
              if (scoreA > scoreB) {
                winnerId = m.teamAId;
              } else if (scoreB > scoreA) {
                winnerId = m.teamBId;
              }

              return {
                ...m,
                scoreA,
                scoreB,
                winnerId,
                status: 'finished' as const,
              };
            });

            return { matches: matchesCopy };
          });

          const m = get().matches.find((x) => x.id === matchId);
          if (m && scoreA !== null && scoreB !== null) {
            const tA = get().teams[m.teamAId]?.name || 'Đội A';
            const tB = get().teams[m.teamBId]?.name || 'Đội B';
            logToStore('Cập Nhật Điểm', `Cập nhật kết quả trận đấu: [${tA}] ${scoreA} - ${scoreB} [${tB}].`);
          }
        },

        resetMatchScore: (matchId) => {
          if (!get().isAdmin) return;
          const m = get().matches.find((x) => x.id === matchId);
          set((state) => {
            const matchesCopy = state.matches.map((x) => {
              if (x.id !== matchId) return x;
              return { ...x, scoreA: null, scoreB: null, winnerId: null, status: 'pending' as const };
            });
            return { matches: matchesCopy };
          });
          if (m) {
            const tA = get().teams[m.teamAId]?.name || 'Đội A';
            const tB = get().teams[m.teamBId]?.name || 'Đội B';
            logToStore('Hủy Kết Quả', `Đặt lại trận đấu về trạng thái chưa diễn ra: ${tA} gặp ${tB}.`);
          }
        },

        generateAllSchedules: () => {
          if (!get().isAdmin) return;
          set((state) => {
            const nextEvents = { ...state.events };
            const settings = state.tournament.settings;

            Object.keys(nextEvents).forEach((evtId) => {
              const evt = nextEvents[evtId];
              const groupList = Object.values(evt.groups || {});
              
              if (groupList.length > 0) {
                const knockoutMatches = (evt.matches || []).filter((m) => m.groupId === 'knockout');
                let groupMatches: Match[] = [];
                
                groupList.forEach((group) => {
                  if (group.teamIds.length >= 2) {
                    const generated = generateRoundRobinMatches(group.id, group.teamIds, settings);
                    groupMatches = [...groupMatches, ...generated];
                  }
                });
                
                // Cân bằng khoảng nghỉ tối ưu giữa các vòng/trận đấu bảng
                const balancedMatches = balanceMatchesRestTime(groupMatches);
                
                nextEvents[evtId] = {
                  ...evt,
                  matches: [...balancedMatches, ...knockoutMatches],
                };
              }
            });

            const activeEvent = nextEvents[state.currentEventId];
            const nextMatches = activeEvent ? activeEvent.matches : [];

            return {
              events: nextEvents,
              matches: nextMatches,
            };
          });

          logToStore('Khởi Tạo Toàn Giải', `Khởi tạo nhanh toàn bộ lịch thi đấu vòng bảng cho tất cả các nội dung.`);
        },

        generateKnockoutBracket: (size) => {
          if (!get().isAdmin) return;
          // 1. Tính toán bảng xếp hạng của các bảng
          const standingsByGroup: Record<string, GroupStanding[]> = {};
          const groupsMap = get().groups;
          const teamsMap = get().teams;
          const matches = get().matches;
          const settings = get().tournament.settings;

          const groupIdsList = Object.keys(groupsMap);
          
          groupIdsList.forEach((gId) => {
            const g = groupsMap[gId];
            const groupMatches = matches.filter((m) => m.groupId === gId);
            standingsByGroup[gId] = calculateGroupStandings(gId, g.teamIds, groupMatches, teamsMap, settings);
          });

          // 2. Chuyển đổi tên bảng để xuất bảng hạng 3
          const groupNamesMap: Record<string, string> = {};
          groupIdsList.forEach((gid) => {
            groupNamesMap[gid] = groupsMap[gid].name;
          });

          const bestThirds = calculateBestThirdPlaces(standingsByGroup, matches, settings, groupNamesMap);

          // 3. Chuẩn bị danh sách đội đi tiếp dựa trên Rank kết quả vòng bảng
          // Ta tạo placeholders đại diện mang nhãn ví dụ "Nhất Bảng A", "Nhì Bảng B", v.v.
          // Nhưng nếu vòng bảng đã xong và sắp xếp hoàn chỉnh, ta đổ thẳng tên đội thật vào các placeholders này!
          const advList: { label: string; placeholder: string; sourceRank?: number; sourceGroupId?: string }[] = [];

          // Dưới đây là sơ đồ cơ bản lấy đội đi tiếp cho bracket 8 đội:
          // Trận 1: Nhất Bảng A vs Nhì Bảng B (hoặc Đội hạng 3 tốt nhất)
          // Trận 2: Nhất Bảng C vs Nhì Bảng D
          // Trận 3: Nhất Bảng B vs Nhì Bảng A
          // Trận 4: Nhất Bảng D vs Nhì Bảng C (hoặc hoán vị hạt giống)
          
          // Tạo một danh sách các slots cho vòng loại trực tiếp
          // Chúng ta sẽ gán các đội thật trong Group Standings nếu có
          const getRealTeamOrPlaceholder = (gLabel: string, rank: number, backupName: string): string => {
            // Xem gLabel có tương ứng với bảng nào không (vd "Bảng A" -> group-1)
            const matchedGroup = Object.values(groupsMap).find(g => g.name.toLowerCase() === gLabel.toLowerCase());
            if (matchedGroup) {
              const standing = standingsByGroup[matchedGroup.id];
              if (standing && standing.find(s => s.rank === rank)) {
                const teamId = standing.find(s => s.rank === rank)!.teamId;
                return tIdToNameOrId(teamId, teamsMap);
              }
            }
            return backupName;
          };

          const getThirdPlaceOrPlaceholder = (rank: number, backupName: string): string => {
            const cand = bestThirds.find(c => c.rank === rank);
            if (cand) {
              return teamsMap[cand.teamId]?.name || cand.teamName;
            }
            return backupName;
          };

          const slotsData: string[] = [];

          if (get().advanceSelectionMode === 'manual') {
            const manualIds = get().manualQualifiedTeamIds || [];
            for (let i = 0; i < size; i++) {
              if (i < manualIds.length) {
                slotsData.push(teamsMap[manualIds[i]]?.name || `Đội ${i + 1}`);
              } else {
                slotsData.push(`Chờ tích thêm vé...`);
              }
            }
            slotsData.forEach((placeholder, idx) => {
              advList.push({
                label: `Slot ${idx + 1}`,
                placeholder: placeholder,
              });
            });
          } else {
            if (size === 4) {
              // 4 ĐỘI
              slotsData.push(
                getRealTeamOrPlaceholder('Bảng A', 1, 'Nhất Bảng A'),
                getRealTeamOrPlaceholder('Bảng B', 2, 'Nhì Bảng B'),
                getRealTeamOrPlaceholder('Bảng B', 1, 'Nhất Bảng B'),
                getRealTeamOrPlaceholder('Bảng A', 2, 'Nhì Bảng A')
              );

              slotsData.forEach((placeholder, idx) => {
                advList.push({
                  label: `Slot ${idx + 1}`,
                  placeholder: placeholder,
                });
              });

            } else if (size === 8) {
              // Cân bằng cho 2-4 bảng đấu rộng rãi
              slotsData.push(
                getRealTeamOrPlaceholder('Bảng A', 1, 'Nhất Bảng A'),
                getThirdPlaceOrPlaceholder(2, 'Hạng 3 Xuất sắc 2'),
                
                getRealTeamOrPlaceholder('Bảng C', 1, 'Nhất Bảng C'),
                getRealTeamOrPlaceholder('Bảng B', 2, 'Nhì Bảng B'),

                getRealTeamOrPlaceholder('Bảng B', 1, 'Nhất Bảng B'),
                getThirdPlaceOrPlaceholder(1, 'Hạng 3 Xuất sắc 1'),

                getRealTeamOrPlaceholder('Bảng D', 1, 'Nhất Bảng D') || getRealTeamOrPlaceholder('Bảng A', 2, 'Nhì Bảng A'),
                getRealTeamOrPlaceholder('Bảng C', 2, 'Nhì Bảng C') || getRealTeamOrPlaceholder('Bảng B', 2, 'Nhì Bảng B')
              );

              slotsData.forEach((placeholder, idx) => {
                advList.push({
                  label: `Slot ${idx + 1}`,
                  placeholder: placeholder,
                });
              });

            } else if (size === 32) {
              // 32 ĐỘI
              const groupsList = Object.values(groupsMap);
              for (let i = 0; i < 16; i++) {
                const gIndexA = i % (groupsList.length || 1);
                const gIndexB = (i + 1) % (groupsList.length || 1);
                const gA = groupsList[gIndexA];
                const gB = groupsList[gIndexB];

                const placeholderA = gA
                  ? getRealTeamOrPlaceholder(gA.name, Math.floor(i / (groupsList.length || 1)) + 1, `Hạng ${Math.floor(i / (groupsList.length || 1)) + 1} ${gA.name}`)
                  : `Hạt giống ${i * 2 + 1}`;

                const placeholderB = gB
                  ? getRealTeamOrPlaceholder(gB.name, Math.floor((i + 1) / (groupsList.length || 1)) + 1, `Hạng ${Math.floor((i + 1) / (groupsList.length || 1)) + 1} ${gB.name}`)
                  : `Hạt giống ${i * 2 + 2}`;

                advList.push(
                  { label: `Trận ${i + 1}-A`, placeholder: placeholderA },
                  { label: `Trận ${i + 1}-B`, placeholder: placeholderB }
                );
              }
            } else {
              // 16 ĐỘI
              // Nhất A, Nhì B, Nhất C, Nhì D, v.v.
              const groupsList = Object.values(groupsMap);
              for (let i = 0; i < 8; i++) {
                const gA = groupsList[i % groupsList.length];
                const gB = groupsList[(i + 1) % groupsList.length];

                const placeholderA = gA 
                  ? getRealTeamOrPlaceholder(gA.name, 1, `Nhất ${gA.name}`) 
                  : `Nhất Bảng ${String.fromCharCode(65 + i)}`;

                const placeholderB = gB 
                  ? getRealTeamOrPlaceholder(gB.name, 2, `Nhì ${gB.name}`) 
                  : `Nhì Bảng ${String.fromCharCode(66 + i)}`;

                advList.push(
                  { label: `Trận ${i+1}-A`, placeholder: placeholderA },
                  { label: `Trận ${i+1}-B`, placeholder: placeholderB }
                );
              }
            }
          }

          const koMatches = generateRoundRobinMatches ? generateKnockoutMatchesSchema(size, advList) : [];

          set((state) => {
            const filtered = state.matches.filter((m) => m.groupId !== 'knockout');
            return {
              matches: [...filtered, ...koMatches],
            };
          });

          logToStore(
            'Nhánh Loại Trực Tiếp',
            `Khởi tạo thành công Sơ đồ thi đấu trực tiếp (Knockout) quy mô ${size} đội, tự động điền các đội vượt qua vòng bảng dựa theo bảng xếp hạng hiện tại.`
          );
        },

        updateKnockoutScore: (matchId, scoreA, scoreB) => {
          if (!get().isAdmin) return;
          set((state) => {
            // Tìm trận đấu và cập nhật kết quả
            const updatedMatches = state.matches.map((m) => {
              if (m.id !== matchId) return m;

              if (scoreA === null || scoreB === null) {
                return { ...m, scoreA: null, scoreB: null, winnerId: null, status: 'pending' as const };
              }

              const winner = scoreA > scoreB ? m.teamAId : m.teamBId;

              return {
                ...m,
                scoreA,
                scoreB,
                winnerId: winner,
                status: 'finished' as const,
              };
            });

            // Tiến hành đẩy Đội thắng vào vòng trong (Auto-progression)
            const targetMatch = updatedMatches.find((m) => m.id === matchId);
            if (targetMatch && targetMatch.status === 'finished' && targetMatch.winnerId) {
              const winnerName = targetMatch.winnerId; // Có thể là tên đội hoặc ID

              if (targetMatch.nextMatchId) {
                const slot = targetMatch.nextMatchSlot;
                
                // Cập nhật trận đấu tiếp theo
                for (let i = 0; i < updatedMatches.length; i++) {
                  if (updatedMatches[i].id === targetMatch.nextMatchId) {
                    if (slot === 'A') {
                      updatedMatches[i].teamAId = winnerName;
                    } else {
                      updatedMatches[i].teamBId = winnerName;
                    }
                    // Nếu trận đấy đã đấu, phải reset điểm vì đối thủ thay đổi (Bảo toàn đồng bộ dữ liệu)
                    updatedMatches[i].scoreA = null;
                    updatedMatches[i].scoreB = null;
                    updatedMatches[i].winnerId = null;
                    updatedMatches[i].status = 'pending';
                    break;
                  }
                }
              }
            }

            return { matches: updatedMatches };
          });

          // Log
          const updatedTarget = get().matches.find((x) => x.id === matchId);
          if (updatedTarget && scoreA !== null && scoreB !== null) {
            logToStore(
              'Điểm Loại Trực Tiếp',
              `Trận [${updatedTarget.knockoutRoundName} - ${updatedTarget.knockoutMatchId}]: ${updatedTarget.teamAId} ${scoreA} - ${scoreB} ${updatedTarget.teamBId}.`
            );
          }
        },

        updateKnockoutParticipant: (matchId, slot, teamNameOrId) => {
          if (!get().isAdmin) return;
          set((state) => {
            const updated = state.matches.map((m) => {
              if (m.id !== matchId) return m;
              const nextM = { ...m };
              if (slot === 'A') {
                nextM.teamAId = teamNameOrId.trim();
              } else {
                nextM.teamBId = teamNameOrId.trim();
              }
              // Reset điểm khi có thay đổi đấu thủ
              nextM.scoreA = null;
              nextM.scoreB = null;
              nextM.winnerId = null;
              nextM.status = 'pending';
              return nextM;
            });
            return { matches: updated };
          });
          const m = get().matches.find((x) => x.id === matchId);
          if (m) {
            logToStore(
              'Điều Chỉnh Trực Tiếp',
              `Sửa thủ công đấu thủ tại trận [${m.knockoutRoundName}] - Nhánh Slot ${slot} thành "${teamNameOrId}".`
            );
          }
        },

        clearKnockout: () => {
          if (!get().isAdmin) return;
          set((state) => ({
            matches: state.matches.filter((m) => m.groupId !== 'knockout'),
          }));
          logToStore('Xóa Nhánh', 'Đã xóa bỏ toàn bộ sơ đồ đấu loại trực tiếp (Knockout).');
        },

        setDarkMode: (dark) => set({ darkMode: dark }),
        setSelectedTab: (tab) => set({ selectedTab: tab }),
        setActiveGroupId: (id) => set({ activeGroupId: id }),
        setAdvanceSelectionMode: (mode) => {
          if (!get().isAdmin) return;
          set({ advanceSelectionMode: mode });
          logToStore('Tuyển chọn', `Thay đổi chế độ tuyển chọn vòng trong thành: ${mode === 'auto' ? 'Tự động' : 'Tích chọn thủ công'}`);
        },
        toggleManualQualifiedTeam: (teamId) => {
          if (!get().isAdmin) return;
          set((state) => {
            const current = state.manualQualifiedTeamIds || [];
            const isExist = current.includes(teamId);
            const nextList = isExist ? current.filter((id) => id !== teamId) : [...current, teamId];
            return { manualQualifiedTeamIds: nextList };
          });
          const tName = get().teams[teamId]?.name || teamId;
          const status = get().manualQualifiedTeamIds.includes(teamId) ? 'vé đi tiếp' : 'gỡ vé';
          logToStore('Tuyển chọn', `Thay đổi trạng thái đấu thủ "${tName}" thành ${status}.`);
        },
        clearManualQualifiedTeams: () => {
          if (!get().isAdmin) return;
          set({ manualQualifiedTeamIds: [] });
          logToStore('Tuyển chọn', `Xóa toàn bộ lựa chọn vé đi tiếp thủ công.`);
        },

        addLog: (action, details) => logToStore(action, details),
        clearLogs: () => {
          if (!get().isAdmin) return;
          set({ logs: [] });
        },

        resetAll: () => {
          if (!get().isAdmin) return;
          set({
            tournament: DEFAULT_TOURNAMENT,
            teams: {},
            groups: {},
            matches: [],
            logs: [],
            darkMode: false,
            selectedTab: 'dashboard',
            activeGroupId: null,
            advanceSelectionMode: 'auto',
            manualQualifiedTeamIds: [],
            events: {
              'event-default': {
                id: 'event-default',
                name: 'Đôi Nam Chuyên Nghiệp',
                teams: {},
                groups: {},
                matches: [],
                settings: DEFAULT_SETTINGS,
                activeGroupId: null,
                advanceSelectionMode: 'auto',
                manualQualifiedTeamIds: []
              }
            },
            currentEventId: 'event-default',
          });
          logToStore('Hệ Thống', 'Đã thiết lập lại toàn bộ dữ liệu ứng dụng về trạng thái mặc định ban đầu.');
        },

        initSupabase: async () => {
          try {
            console.log('Khởi tạo và đồng bộ dữ liệu từ Supabase...');
            
            // Lấy trạng thái dữ liệu trong store cục bộ trước khi query (khôi phục từ localStorage)
            const localState = get();
            const hasLocalTeams = Object.keys(localState.teams || {}).length > 0;
            const hasLocalMatches = (localState.matches || []).length > 0;
            const hasLocalData = hasLocalTeams || hasLocalMatches;

            // 1. Đọc giải đấu (Tournament metadata)
            const { data: tData, error: tError } = await supabase.from('tournament').select('*');
            if (tError) {
              if (tError.code === '42P01' || tError.message?.includes('relation') || tError.message?.includes('does not exist')) {
                console.warn('LƯU Ý: Các bảng dữ liệu chưa được khởi tạo trên Supabase. Đang chạy ở chế độ dự phòng Offline.');
                originalSet({ supabaseConnected: false });
                return;
              }
              throw tError;
            }

            // 2. Đọc danh sách sự kiện
            const { data: eData, error: eError } = await supabase.from('events').select('*');
            if (eError) throw eError;

            // 3. Đọc dữ liệu khác cấu trúc
            const { data: teamData, error: teamError } = await supabase.from('teams').select('*');
            if (teamError) throw teamError;

            const { data: groupData, error: groupError } = await supabase.from('groups').select('*');
            if (groupError) throw groupError;

            const { data: matchData, error: matchError } = await supabase.from('matches').select('*');
            if (matchError) throw matchError;

            const { data: logData } = await supabase.from('audit_logs').select('*').order('id', { ascending: false }).limit(500);

            const hasRemoteData = (teamData && teamData.length > 0) || (matchData && matchData.length > 0);

            // TÌNH HUỐNG 1: TRÊN CLOUD TRỐNG HOÀN TOÀN NHƯNG DƯỚI CLIENT LẠI CÓ SẴN DỮ LIỆU
            // Đây là lúc ta vừa kết nối Supabase trống. Nếu là ADMIN, tự động đồng bộ (push) dữ liệu cũ lên cloud!
            if (!hasRemoteData && hasLocalData) {
              if (localState.isAdmin) {
                console.log('Phát hiện cơ sở dữ liệu Supabase online đang trống, nhưng Client lại đang có dữ liệu giải đấu cũ. Đang tự động tải dữ liệu cục bộ lên đám mây làm dữ liệu gốc...');
                await syncStateToSupabase(localState);
                
                // Đồng bộ mảng logs ban đầu nếu có
                if (localState.logs && localState.logs.length > 0) {
                  const initialLogs = localState.logs.slice(0, 100).map(l => ({
                    timestamp: l.timestamp,
                    action: l.action,
                    details: l.details
                  }));
                  await supabase.from('audit_logs').insert(initialLogs);
                }

                originalSet({ supabaseConnected: true });
                console.log('Tự động nạp dữ liệu ban đầu lên Supabase trực tuyến thành công!');
                return;
              } else {
                // Nếu là Viewer vãng lai nhưng Cloud đang trống, ta giữ lại thông tin local cache để hiển thị tránh trắng trang.
                console.log('Cơ sở dữ liệu Supabase online trống, hiển thị tạm thời trạng thái Local Cache đệm.');
                originalSet({ supabaseConnected: true });
                return;
              }
            }

            // TÌNH HUỐNG 2: SUPABASE ĐÃ CÓ SẴN DỮ LIỆU THỰT -> TỰ ĐỘNG TẢI VỀ VÀ CẬP NHẬT TRÌNH DUYỆT
            let dbTournament = tData && tData.length > 0 ? tData[0] : null;
            if (!dbTournament) {
              const defaultObj = {
                id: 't-1',
                name: DEFAULT_TOURNAMENT.name,
                organization: DEFAULT_TOURNAMENT.organization,
                location: DEFAULT_TOURNAMENT.location,
                date: DEFAULT_TOURNAMENT.date,
                settings: DEFAULT_SETTINGS,
                current_event_id: 'event-default'
              };
              if (localState.isAdmin) {
                await supabase.from('tournament').insert([defaultObj]);
              }
              dbTournament = defaultObj;
            }

            let dbEvents = eData || [];
            if (dbEvents.length === 0) {
              const defaultEvt = {
                id: 'event-default',
                name: 'Đôi Nam Chuyên Nghiệp',
                settings: DEFAULT_SETTINGS,
                active_group_id: null,
                advance_selection_mode: 'auto',
                manual_qualified_team_ids: []
              };
              if (localState.isAdmin) {
                await supabase.from('events').insert([defaultEvt]);
              }
              dbEvents = [defaultEvt];
            }

            // Khởi tạo cấu trúc map của events
            const eventsRecord: Record<string, EventData> = {};
            dbEvents.forEach(evt => {
              const activeGroupId = evt.active_group_id !== undefined ? evt.active_group_id : (evt.activeGroupId || null);
              const advanceSelectionMode = evt.advance_selection_mode !== undefined ? evt.advance_selection_mode : (evt.advanceSelectionMode || 'auto');
              const manualQualifiedTeamIds = evt.manual_qualified_team_ids !== undefined ? evt.manual_qualified_team_ids : (evt.manualQualifiedTeamIds || []);

              eventsRecord[evt.id] = {
                id: evt.id,
                name: evt.name,
                settings: evt.settings || DEFAULT_SETTINGS,
                activeGroupId: activeGroupId,
                advanceSelectionMode: advanceSelectionMode,
                manualQualifiedTeamIds: manualQualifiedTeamIds,
                teams: {},
                groups: {},
                matches: []
              };
            });

            // Nạp thông tin Đội (teams)
            const loadedTeams = teamData || [];
            loadedTeams.forEach(t => {
              const eventId = t.event_id || t.eventId;
              if (eventsRecord[eventId]) {
                const groupId = t.group_id !== undefined ? t.group_id : t.groupId;
                eventsRecord[eventId].teams[t.id] = {
                  id: t.id,
                  name: t.name,
                  groupId: groupId,
                  seed: t.seed
                };
              }
            });

            // Nạp thông tin Nhóm/Bảng đấu (groups)
            const loadedGroups = groupData || [];
            loadedGroups.forEach(g => {
              const eventId = g.event_id || g.eventId;
              if (eventsRecord[eventId]) {
                const teamIds = g.team_ids !== undefined ? g.team_ids : (g.teamIds || []);
                eventsRecord[eventId].groups[g.id] = {
                  id: g.id,
                  name: g.name,
                  teamIds: teamIds
                };
              }
            });

            // Nạp thông tin Trận đấu (matches)
            const loadedMatches = matchData || [];
            loadedMatches.forEach(m => {
              const eventId = m.event_id || m.eventId;
              if (eventsRecord[eventId]) {
                const groupId = m.group_id !== undefined ? m.group_id : m.groupId;
                const teamAId = m.team_a_id !== undefined ? m.team_a_id : m.teamAId;
                const teamBId = m.team_b_id !== undefined ? m.team_b_id : m.teamBId;
                const scoreA = m.score_a !== undefined ? m.score_a : (m.scoreA !== undefined ? m.scoreA : null);
                const scoreB = m.score_b !== undefined ? m.score_b : (m.scoreB !== undefined ? m.scoreB : null);
                const winnerId = m.winner_id !== undefined ? m.winner_id : m.winnerId;
                const knockoutRoundName = m.knockout_round_name !== undefined ? m.knockout_round_name : m.knockoutRoundName;
                const knockoutMatchId = m.knockout_match_id !== undefined ? m.knockout_match_id : m.knockoutMatchId;
                const nextMatchId = m.next_match_id !== undefined ? m.next_match_id : m.nextMatchId;
                const nextMatchSlot = m.next_match_slot !== undefined ? m.next_match_slot : m.nextMatchSlot;

                eventsRecord[eventId].matches.push({
                  id: m.id,
                  groupId: groupId,
                  teamAId: teamAId,
                  teamBId: teamBId,
                  scoreA: scoreA,
                  scoreB: scoreB,
                  winnerId: winnerId,
                  status: m.status,
                  round: m.round,
                  knockoutRoundName: knockoutRoundName,
                  knockoutMatchId: knockoutMatchId,
                  nextMatchId: nextMatchId,
                  nextMatchSlot: nextMatchSlot
                });
              }
            });

            // Thiết lập sự kiện hiện tại
            const currentEventId = dbTournament.current_event_id || dbTournament.currentEventId || 'event-default';
            const activeEvent = eventsRecord[currentEventId] || Object.values(eventsRecord)[0] || {
              id: 'event-default',
              name: 'Đôi Nam Chuyên Nghiệp',
              settings: DEFAULT_SETTINGS,
              activeGroupId: null,
              advanceSelectionMode: 'auto',
              manualQualifiedTeamIds: [],
              teams: {},
              groups: {},
              matches: []
            };

            const tournamentState: Tournament = {
              id: dbTournament.id,
              name: dbTournament.name,
              organization: dbTournament.organization,
              location: dbTournament.location,
              date: dbTournament.date,
              settings: activeEvent.settings || dbTournament.settings || DEFAULT_SETTINGS
            };

            const logsState: AuditLog[] = (logData || []).map(l => ({
              timestamp: l.timestamp,
              action: l.action,
              details: l.details
            }));

            // Lưu dữ liệu trực tuyến đồng bộ hoàn chỉnh vào Zustand store
            originalSet({
              tournament: tournamentState,
              events: eventsRecord,
              currentEventId: activeEvent.id,
              teams: activeEvent.teams,
              groups: activeEvent.groups,
              matches: activeEvent.matches,
              activeGroupId: activeEvent.activeGroupId,
              advanceSelectionMode: activeEvent.advanceSelectionMode,
              manualQualifiedTeamIds: activeEvent.manualQualifiedTeamIds,
              logs: logsState,
              supabaseConnected: true,
            });

            console.log('Nạp dữ liệu trực tuyến từ Supabase thành công!');
          } catch (e) {
            console.error('Lỗi khi đồng bộ từ Supabase, chuyển sang chế độ dự phòng Local:', e);
            originalSet({
              supabaseConnected: false,
            });
          }
        },
      };
    },
    {
      name: 'pickleball-tournament-cache', // Khóa lưu trữ LocalStorage
    }
  )
);

function tIdToNameOrId(id: string, teamsMap: Record<string, Team>): string {
  if (teamsMap[id]) return teamsMap[id].name;
  return id;
}
