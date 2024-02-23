# fmereport-plugin
A plugin to show results from FME Flow workspaces

## Download the plugin

- Download the code.
- Unpack it to your local folder.
- Open in your code editor or command prompt and run "npm install" and then "npm run build".
- Copy the build folder and paste it in a plugins folder in your Origo project.
  
## To use the plugin

Be sure to edit your folders and filenames for your project.

In the Origo project index.html import swiper component

```html
<!--Add in header-->
<link href="plugins/fmereport.css" rel="stylesheet" />

<!--Add in body-->
<script src="plugins/fmereport.min.js"></script>
<script type="text/javascript">
	//Init origo
		var origo = Origo('index.json');
		origo.on('load', function (viewer) {
        var fmereport = Fmereport({
			reportNames: ['Byggrapport', 'Another report title'],
			reportUrls: ['urlToFMEFlow/fmedatastreaming/SEIAWC/Byggrapport.fmw?token=token', 'Another URL']
			});
        viewer.addComponent(fmereport);
      });
</script>
```
