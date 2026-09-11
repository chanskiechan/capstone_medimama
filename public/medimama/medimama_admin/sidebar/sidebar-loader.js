(() => {
    const loader = document.currentScript;
    const mount = document.querySelector('[data-medimama-sidebar]');

    if (!loader || !mount) return;

    const addStylesheet = (href, id) => {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    };

    addStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css', 'medimama-fontawesome');
    addStylesheet('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap', 'medimama-poppins');
    addStylesheet(new URL('sidebar.css', loader.src).href, 'medimama-sidebar-styles');

    const renderSidebar = () => {
        const fragment = document.createElement('template');
        fragment.innerHTML = window.MediMamaSidebarMarkup.trim();
            const component = fragment.content.firstElementChild;
            mount.replaceWith(component);

            component.querySelector('[data-logo="icon"]').src = new URL('../../medimama logo1.png', loader.src).href;
            component.querySelector('[data-logo="wordmark"]').src = new URL('../../medimama logo2.png', loader.src).href;
            component.querySelector('[data-login-link]').href = new URL('../medimamaloginandsignup/medimamalogin.html', loader.src).href;

            const behavior = document.createElement('script');
            behavior.src = new URL('sidebar.js', loader.src).href;
            document.body.appendChild(behavior);
    };

    const componentScript = document.createElement('script');
    componentScript.src = new URL('sidebar-component.js', loader.src).href;
    componentScript.addEventListener('load', renderSidebar, { once: true });
    componentScript.addEventListener('error', () => console.error('Sidebar component could not be loaded.'), { once: true });
    document.body.appendChild(componentScript);
})();
