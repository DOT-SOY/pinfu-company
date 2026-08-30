import { commandDefinition, commandSummary, commandError } from './skill-command-model.js';
import { message } from './ui.js';

export function renderCommandDialog() {
  return `<dialog class="skill-command-dialog" id="skill-command-dialog" aria-labelledby="skill-command-title">
    <form id="skill-command-form"><h2 id="skill-command-title">대상 명령 등록</h2>
      <p class="character-note">공유 명령을 등록한 뒤 현재 효과의 대상으로 선택합니다. 스킬 변경은 마지막에 별도로 저장해야 합니다.</p>
      <div class="character-fields">
        <label>명령어<input name="command" required maxlength="81" placeholder="예: /정리" autocomplete="off" autofocus><small>/를 생략하면 자동으로 붙입니다.</small></label>
        <label>표시명<input name="display_name" required maxlength="200" placeholder="예: 정리"></label>
        <label>명령 활성<select name="enabled"><option value="true">활성</option><option value="false">비활성</option></select><small>활성 명령은 봇을 다시 실행하면 사용할 수 있습니다.</small></label>
        <label>행동횟수 차감<select name="consumes_action"><option value="true">행동 1회 차감</option><option value="false">차감하지 않음</option></select></label>
      </div><label class="skill-command-description">설명<textarea name="description" rows="2" maxlength="10000" placeholder="선택 입력"></textarea></label>
      <label class="character-pause"><input name="dice_enabled" type="checkbox">다이스 사용</label>
      <fieldset id="skill-command-dice" disabled><legend>다이스 설정</legend><div class="character-fields">
        <label>최소값<input name="dice_min" type="number" step="1" min="-2147483648" max="2147483647" value="1" required></label>
        <label>최대값<input name="dice_max" type="number" step="1" min="-2147483648" max="2147483647" value="100" required></label>
        <label>성공 기준<input name="dice_threshold" type="number" step="1" min="-2147483648" max="2147483647" value="50" placeholder="빈칸 = 판정 안 함"><small>기준 이상이면 성공. 실패 재굴림 효과를 쓰려면 기준을 입력하세요.</small></label>
      </div></fieldset>
      <p class="skill-warning">일반 행동 명령만 등록합니다. 컨디션·스탯 등의 기본 증감 규칙은 생성하지 않습니다. 기본 변화량이 없으면 소모 배율·스탯 증감 효과가 작동하지 않을 수 있습니다.<br>이 등록은 즉시 저장됩니다. 나중에 스킬 편집을 취소해도 등록한 명령은 남습니다.</p>
      <label class="character-pause"><input name="bot_paused" type="checkbox">봇 실행을 일시 중지했습니다. (자동 중지 기능이 아닙니다.)</label>
      <div class="character-actions"><button type="submit" class="submit-button">명령 등록 후 선택</button><button type="button" data-command-close>취소</button></div>
      <div id="skill-command-message" role="status"></div>
    </form></dialog>`;
}

export function bindCommandDialog({root,page,live,createCommand,onCreated}) {
  const dialog=root.querySelector('#skill-command-dialog');
  const form=dialog.querySelector('form');
  const dice=form.querySelector('#skill-command-dice');
  const output=dialog.querySelector('#skill-command-message');
  const say=(text,type='error')=>{output.innerHTML=message(text,type);};
  const close=()=>{
    if(page.busy) return;
    if(page.commandDirty && !confirm('입력 중인 명령 등록을 취소할까요? 스킬 편집 내용은 유지됩니다.')) return;
    page.commandDirty=false;dialog.close();
  };
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  form.querySelector('[data-command-close]').addEventListener('click',close);
  form.addEventListener('input',()=>{page.commandDirty=true;});
  form.addEventListener('change',()=>{page.commandDirty=true;});
  form.elements.dice_enabled.addEventListener('change',()=>{dice.disabled=!form.elements.dice_enabled.checked;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(page.busy || !live()) return;
    let command;
    try {
      const fields=new FormData(form);
      command=commandDefinition({command:fields.get('command'),display_name:fields.get('display_name'),description:fields.get('description'),
        enabled:fields.get('enabled')==='true',consumes_action:fields.get('consumes_action')==='true',dice_enabled:form.elements.dice_enabled.checked,
        dice_min:fields.get('dice_min'),dice_max:fields.get('dice_max'),dice_threshold:fields.get('dice_threshold')});
    } catch(error) {say(commandError(error));return;}
    if(!form.elements.bot_paused.checked) {say(commandError({message:'BOT_PAUSE_REQUIRED'}));return;}
    if(!confirm(commandSummary(command)+'\n\n명령 자체는 즉시 저장됩니다. 등록할까요?')) return;
    page.busy=true;
    const controls=[...form.querySelectorAll('input,select,textarea,button')].map(c=>[c,c.disabled]);controls.forEach(([c])=>c.disabled=true);
    say('등록 중…','');
    try {
      const created=await createCommand(command,true);
      if(!live())return;
      onCreated(created,page.commandTargetIndex);
      page.commandDirty=false;dialog.close();
    } catch(error) {if(live()) say(commandError(error));}
    finally {page.busy=false;if(live())controls.forEach(([c,disabled])=>{if(c.isConnected)c.disabled=disabled;});}
  });
  return (index,modifierType)=>{
    if(page.busy || !live())return;
    form.reset();output.innerHTML='';page.commandDirty=false;page.commandTargetIndex=index;
    form.elements.dice_enabled.checked=modifierType.startsWith('dice_');
    dice.disabled=!form.elements.dice_enabled.checked;
    // Require an explicit confirmation for this separate database write.
    form.elements.bot_paused.checked=false;
    dialog.showModal();
  };
}
