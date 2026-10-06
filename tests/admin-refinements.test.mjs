import assert from 'node:assert/strict';
import test from 'node:test';
import {newActionRule,actionDefinition,validateAction,actionChanges} from '../js/action-admin-model.js';
globalThis.window={addEventListener(){}};
const {renderActionEditor,renderActionRule}=await import('../js/pages/actions-admin.js');
delete globalThis.window;
const choices={commands:[{id:'1',name:'/청소'}],stats:[{id:'1',name:'실시간 스탯',enabled:true}]};
const actionDraft=()=>({command:{command:'/검증',display_name:'검증',description:'',enabled:true,hidden:false,consumes_action:true,dice_enabled:false,dice_min:1,dice_max:100,dice_threshold:null,success_message:null,fail_message:null},rules:[]});
test('requirements render conditions, omit effects and normalize payload without ignored fields',()=>{
 const rule={...newActionRule(),id:'1',rule_type:'requirement',condition_min:10,condition_delta:123,stats:[{id:'2',stat_id:'1',delta:99}]};
 const html=renderActionRule(rule,0,choices);
 for(const field of ['condition_min','condition_max','use_from','use_to','previous_command_id','dice_outcome'])assert.ok(html.includes('name="'+field+'"'));
 assert.ok(!html.includes('name="condition_delta"'));assert.ok(!html.includes('data-action-stat'));assert.ok(html.includes('보존'));
 const d=validateAction({...actionDraft(),rules:[rule]});
 assert.equal('condition_delta' in d.rules[0],false);assert.equal('stats' in d.rules[0],false);
 const snapshot={...choices,command:{id:'1',...actionDraft().command},rules:[rule]};
 assert.equal('stats' in actionDefinition(snapshot).rules[0],false);
 const switched={...rule,rule_type:'effect'};
 assert.doesNotThrow(()=>actionChanges(snapshot,validateAction({...actionDraft(),rules:[switched]})));
 assert.ok(renderActionRule(switched,0,choices).includes('data-action-stat'));
});
test('dice fields are hidden only when dice is disabled',()=>{
 const data={...choices,command:{id:null,...actionDraft().command},rules:[]};
 assert.match(renderActionEditor(data),/class="character-fields action-dice-fields" hidden/);
 data.command.dice_enabled=true;
 assert.doesNotMatch(renderActionEditor(data),/class="character-fields action-dice-fields" hidden/);
});
