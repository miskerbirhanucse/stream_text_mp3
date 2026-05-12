# stream_text_mp3
# to use this application there are two options 
# on the first terminal you need to run node server.js
# on the second terminal you need to run npx vite  


# for killing already running port use ` kill -9 $(lsof -t -i:5173)  this is for vite app 
# for server.js or node you can use    lsof -ti :3001 | xargs kill -9    

# if you want to update the tree structure of the code use this code tree -I "node_modules|.git|.next|out|dist" > tree.txt   