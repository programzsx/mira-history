$codex = 'C:\Users\Administrator\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe'
$repo = 'D:\zhangshixin\wenyuange\mira-history'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$prompt = @'
Please process the txt file in the current repository whose size is 2183335 bytes.
Generate an md file in the same directory and with the same base name.
Read the workflow prompt at D:\zhangshixin\wenyuange\mira-txt-workflow-prompt.txt.
Load the skills zsx-lan and zsx-md.
Translate the source text into modern Chinese.
Explain terms, rare characters, allusions, and historical context.
Rewrite the result in the zsx-lan style.
Output one Chinese sentence per line.
Do not modify the source txt.
Do not invent facts.
Do not include the original text.
Do not use tables or ordered lists.
Process the entire file, in batches if needed.
After finishing, verify completeness and report the output path.
'@
$prompt | & $codex exec -C $repo --dangerously-bypass-approvals-and-sandbox -
