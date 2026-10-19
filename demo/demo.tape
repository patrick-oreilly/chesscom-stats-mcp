Output demo/demo.gif
Set Shell zsh
Set FontSize 14
Set Width 1180
Set Height 1040
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "for v in ${(k)parameters[(I)CLAUDE*]}; do unset $v; done; cd demo && clear && export PS1='$ ' && alias claude='claude --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__chesscom'"
Enter
Type "clear"
Enter
Show

Type "claude"
Enter
Sleep 4s
Type "how did I do on chess.com this month?"
Sleep 600ms
Enter
Sleep 22s
Sleep 8s
