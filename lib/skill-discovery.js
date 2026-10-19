// The bundle mounts DSH's native filesystem provider. This adapter reads the
// merged host catalog, including custom sources registered by the user's profile.
export function connectSkillDiscovery(ctx, manager) {
 let invalidate;
 ctx.effect(()=>ctx.skills.registerProvider(control=>{
  invalidate=control.invalidate;
  return {name:'dsh-ppt-studio-refresh',list:async()=>[],get:async()=>undefined};
 }));
 manager.discover=async()=>{
  const snapshot=await ctx.skills.snapshot();
  if(!snapshot.complete)throw new Error('DSH 的 Skill 清单暂未读取完整，请稍后重试');
  return snapshot.skills;
 };
 // Provider controls are the public API for invalidating the shared catalog.
 manager.invalidateSkills=()=>invalidate();
}
